'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
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
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = useTenant();
  const supabase = createClient(tenant.slug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorParam = searchParams.get('error');
  const messageParam = searchParams.get('message');
  const loginRedirect = searchParams.get('redirect');
  const signupHref =
    loginRedirect &&
    loginRedirect.startsWith('/') &&
    !loginRedirect.startsWith('//') &&
    !loginRedirect.includes(':')
      ? `/signup?redirect=${encodeURIComponent(loginRedirect)}`
      : '/signup';

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    setError(null);

    try {
      // Sign in with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (authError || !authData.user) {
        setError(authError?.message || 'Invalid email or password');
        setLoading(false);
        return;
      }

      // Get user role
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (userError || !userData) {
        setError('User profile not found');
        setLoading(false);
        return;
      }

      // Respect redirect param (e.g. /join/CODE) or redirect based on role
      const redirectTo = searchParams.get('redirect');
      const safeRedirect =
        redirectTo &&
        redirectTo.startsWith('/') &&
        !redirectTo.startsWith('//') &&
        !redirectTo.includes(':');

      if (safeRedirect) {
        // Full navigation so the target page (e.g. join link) loads with auth cookie and shows content
        window.location.assign(redirectTo);
        return;
      } else {
        const role = userData.role;
        if (role === 'coach') {
          router.push('/athlete-dashboard');
        } else if (role === 'youth_wrestler') {
          router.push('/youth-dashboard');
        } else if (role === 'admin') {
          router.push('/dashboard');
        } else {
          router.push('/dashboard');
        }
      }

      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground font-serif">Welcome Back to The Guild</CardTitle>
          <CardDescription>
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messageParam === 'password_reset' && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Password updated. Sign in with your new password.
              </p>
            </div>
          )}

          {(error || errorParam) && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">
                {error || (errorParam === 'auth_failed' && 'Authentication failed') || 'An error occurred'}
              </p>
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
                        placeholder="you@example.com"
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="mb-0">Password</FormLabel>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-accent hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
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
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-sm">
            <p className="text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href={signupHref} className="text-accent hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
