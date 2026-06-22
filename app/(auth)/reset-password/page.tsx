'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { PASSWORD_RESET_ERROR_MESSAGES } from '@/lib/password-recovery-redirect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const schema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirm: z.string().min(6, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type ResetValues = z.infer<typeof schema>;

function parseRecoveryHash(): { access_token: string; refresh_token: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = useTenant();
  const [initError, setInitError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  useEffect(() => {
    let cancelled = false;
    const client = createClient(tenant.slug);

    const finishOk = () => {
      if (cancelled) return;
      if (typeof window !== 'undefined') {
        const clean = window.location.pathname;
        window.history.replaceState(null, '', clean);
      }
      setSessionOk(true);
      setReady(true);
    };

    const finishErr = (message: string) => {
      if (cancelled) return;
      setInitError(message);
      setReady(true);
    };

    const errorKey = searchParams.get('error');
    if (errorKey) {
      finishErr(
        PASSWORD_RESET_ERROR_MESSAGES[errorKey] ??
          PASSWORD_RESET_ERROR_MESSAGES.invalid_link ??
          'This reset link is invalid or expired.'
      );
      return () => {
        cancelled = true;
      };
    }

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session?.user) {
        finishOk();
      }
    });

    async function init() {
      try {
        const code = searchParams.get('code');
        if (code) {
          const { data: exchanged, error: exchangeErr } =
            await client.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            finishErr(
              exchangeErr.message?.includes('code verifier') ||
                /pkce/i.test(exchangeErr.message)
                ? PASSWORD_RESET_ERROR_MESSAGES.pkce_browser
                : exchangeErr.message || PASSWORD_RESET_ERROR_MESSAGES.exchange_failed
            );
            return;
          }
          if (exchanged?.session?.user) {
            finishOk();
            return;
          }
        }

        const hashTokens = parseRecoveryHash();
        if (hashTokens) {
          const { data, error: hashErr } = await client.auth.setSession(hashTokens);
          if (hashErr) {
            finishErr(hashErr.message || PASSWORD_RESET_ERROR_MESSAGES.invalid_link);
            return;
          }
          if (data.session?.user) {
            finishOk();
            return;
          }
        }

        for (const delayMs of [0, 150, 400, 900]) {
          if (cancelled) return;
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          const {
            data: { session },
          } = await client.auth.getSession();
          if (session?.user) {
            finishOk();
            return;
          }
        }

        finishErr(PASSWORD_RESET_ERROR_MESSAGES.invalid_link);
      } catch {
        finishErr('Could not verify reset link.');
      }
    }

    void init();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [tenant.slug, searchParams]);

  const onSubmit = async (values: ResetValues) => {
    setLoading(true);
    setError(null);
    try {
      const client = createClient(tenant.slug);
      const { error: updateErr } = await client.auth.updateUser({ password: values.password });
      if (updateErr) {
        setError(updateErr.message || 'Could not update password');
        setLoading(false);
        return;
      }
      router.push('/login?message=password_reset');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Verifying link…</p>
      </div>
    );
  }

  if (initError || !sessionOk) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-foreground font-serif">Link invalid</CardTitle>
            <CardDescription className="text-sm leading-relaxed">{initError}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" asChild>
              <Link href="/forgot-password">Request a new reset link</Link>
            </Button>
            <div className="text-center text-sm">
              <Link href="/login" className="text-accent hover:underline">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground font-serif">Choose a new password</CardTitle>
          <CardDescription>Enter a new password for your Guild account.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-accent dark-input-fill"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-accent dark-input-fill"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
