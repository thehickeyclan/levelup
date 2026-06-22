'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        dev_reset_url?: string;
      };

      if (!res.ok) {
        setError(
          data.error ||
            'Could not send reset email. Try again or contact info@WrestlingGuild.com for help.'
        );
        return;
      }

      setDevResetUrl(data.dev_reset_url ?? null);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground font-serif">Reset password</CardTitle>
          <CardDescription>
            Enter the email you use for The Guild. We&apos;ll send a link to choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              {devResetUrl ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Local dev mode — email is not configured. Use this one-time link to reset your
                    password:
                  </p>
                  <a
                    href={devResetUrl}
                    className="block text-sm text-accent underline break-all rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                  >
                    {devResetUrl}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Open the link once. For production, set RESEND_API_KEY and EMAIL_FROM in env.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    If an account exists for that email, we sent a reset link. Check your inbox and
                    spam folder.
                  </p>
                  <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2.5 leading-relaxed">
                    Open the link in any browser (Chrome, Safari, etc.). The link works from your
                    email app — you do not need to use the same browser you used here.
                  </p>
                </>
              )}
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-md border border-destructive/40 bg-destructive/10">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-accent dark-input-fill"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </Button>
                </form>
              </Form>
              <div className="mt-4 text-center text-sm">
                <Link href="/login" className="text-accent hover:underline">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
