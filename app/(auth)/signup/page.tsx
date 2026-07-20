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
  FormDescription,
} from '@/components/ui/form';
import Link from 'next/link';
import { isValidUsZipCode } from '@/lib/us-zip';

const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  zipCode: z
    .string()
    .min(1, 'Home ZIP code is required')
    .refine(isValidUsZipCode, 'Enter a valid U.S. ZIP code (5 digits or ZIP+4)'),
  phone: z
    .string()
    .min(1, 'Cell phone is required')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid 10-digit cell number'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  discountCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get('invite')?.trim() || undefined;
  const refFromUrl = searchParams?.get('ref')?.trim() || undefined;
  const roleParam = searchParams?.get('role')?.toLowerCase();
  const redirectTo = searchParams?.get('redirect')?.trim();
  const safeRedirect: string | null =
    redirectTo &&
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('//') &&
    !redirectTo.includes(':')
      ? redirectTo
      : null;
  const tenant = useTenant();
  const supabase = createClient(tenant.slug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when signup URL had ?ref= or browser already stored a referral code from a prior visit. */
  const [referralLinkActive, setReferralLinkActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (refFromUrl) {
        window.localStorage.setItem('guild_referral_code', refFromUrl);
        setReferralLinkActive(true);
      } else if (window.localStorage.getItem('guild_referral_code')?.trim()) {
        setReferralLinkActive(true);
      }
    } catch {
      /* ignore */
    }
  }, [refFromUrl]);

  // Coach recruitment funnel: landing page before application
  useEffect(() => {
    if (roleParam === 'coach') {
      router.replace('/coaches');
    }
  }, [roleParam, router]);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      zipCode: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      discountCode: '',
    },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          zipCode: values.zipCode.trim(),
          phone: values.phone.trim(),
          email: values.email,
          password: values.password,
          role: 'parent',
          discountCode: values.discountCode?.trim() || undefined,
          inviteToken: inviteToken || undefined,
          referralCode:
            (typeof window !== 'undefined'
              ? window.localStorage.getItem('guild_referral_code')?.trim()
              : undefined) ||
            refFromUrl ||
            undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }

      // Auto-login after signup using Supabase client
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (authError || !authData.user) {
        router.push('/login?message=signup_success');
        return;
      }

      // If they came from a redirect (e.g. join link), send them back after signup
      if (safeRedirect) {
        router.push(safeRedirect);
        router.refresh();
        return;
      }

      // Training is the parent home: join an available session or request one from a coach.
      router.push('/training');
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  // If role=coach, show loading while redirecting
  if (roleParam === 'coach') {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Redirecting to coach application...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground font-serif">Parent Sign Up</CardTitle>
          <CardDescription>
            Create your account to book training sessions for your wrestler
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input placeholder="First name" autoComplete="given-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input placeholder="Last name" autoComplete="family-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home ZIP code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 27514"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {`Used to show coaches and programs near your family (maps and discovery).`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cell phone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="Mobile number"
                        autoComplete="tel"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Required for session texts and coach contact (same standard as wrestler signup).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {referralLinkActive && (
                <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
                  You&apos;re signing up through a referral link — that&apos;s already applied. Leave the field
                  below blank unless you also have a separate Guild promo or discount code.
                </p>
              )}

              <FormField
                control={form.control}
                name="discountCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Promo or discount code (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. FAMILY10" autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>
                      Only for codes issued by The Guild (percent-off promos). Not for friend referrals.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full bg-accent hover:bg-accent-hover text-black" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm space-y-2">
            <p className="text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-muted-foreground">
              Want to coach?{' '}
              <Link href="/coaches" className="text-accent hover:underline">
                Apply as a coach
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
