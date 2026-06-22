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
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import { getPasswordRecoveryRedirectTo } from '@/lib/password-recovery-redirect';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const tenant = useTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      // Must use browser Supabase client so PKCE code_verifier is stored here; server API breaks recovery.
      const supabase = createClient(tenant.slug);
      const redirectTo = getPasswordRecoveryRedirectTo();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        values.email.trim(),
        { redirectTo }
      );
      if (resetError) {
        const msg = resetError.message || 'Could not send reset email';
        const rl =
          /rate limit|too many|email rate/i.test(msg) || msg.toLowerCase().includes('exceeded');
        setRateLimited(rl);
        setError(
          rl
            ? 'Too many reset emails were sent recently. Please wait about an hour and try again, or contact info@WrestlingGuild.com if you need help sooner.'
            : msg
        );
        setLoading(false);
        return;
      }
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
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, we sent a reset link. Check your inbox and spam
                folder.
              </p>
              <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2.5 leading-relaxed">
                Open the link in the <span className="font-medium text-foreground">same browser</span>{' '}
                you used here. If you requested this in Safari, open the email in Mail/Safari — not
                Gmail&apos;s in-app browser (they don&apos;t share login cookies).
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className={
                    rateLimited
                      ? 'mb-4 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                      : 'mb-4 p-3 bg-destructive/10 border border-destructive rounded-md'
                  }
                >
                  <p className={`text-sm ${rateLimited ? '' : 'text-destructive'}`}>{error}</p>
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
