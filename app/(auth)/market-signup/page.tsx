'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';

/**
 * Market-first signup: name + email + password only. Phone and ZIP are
 * collected later at the first booking or sale. Built for the TOC vendor
 * table where every extra field is a lost heart.
 */
function MarketSignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = useTenant();
  const supabase = createClient(tenant.slug);

  const redirectTo = searchParams?.get('redirect')?.trim();
  const safeRedirect =
    redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') && !redirectTo.includes(':')
      ? redirectTo
      : '/market';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referral links (?ref=) still attribute, same storage as the main signup.
  useEffect(() => {
    const ref = searchParams?.get('ref')?.trim();
    if (ref) {
      try {
        window.localStorage.setItem('guild_referral_code', ref);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let referralCode: string | undefined;
      try {
        referralCode = window.localStorage.getItem('guild_referral_code')?.trim() || undefined;
      } catch {
        /* ignore */
      }
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'parent',
          marketOnly: true,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password,
          ...(referralCode ? { referralCode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create your account');
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        router.push('/login?message=signup_success');
        return;
      }
      window.location.assign(safeRedirect);
    } catch {
      setError('Could not create your account — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent text-center">
          Guild Market
        </p>
        <h1 className="font-serif text-3xl text-white text-center mt-2">
          Save your favorite shoes.
        </h1>
        <p className="text-sm text-zinc-400 text-center mt-2 mb-8">
          Free account · 30 seconds · heart pairs, make offers, buy, sell, and trade.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white placeholder:text-zinc-500"
            />
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              autoComplete="family-name"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white placeholder:text-zinc-500"
            />
          </div>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white placeholder:text-zinc-500"
          />
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            autoComplete="new-password"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white placeholder:text-zinc-500"
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent py-3 font-semibold text-black hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating your account…' : 'Create free account'}
          </button>
        </form>

        <p className="text-xs text-zinc-500 text-center mt-4">
          Booking training later? We&apos;ll ask for your phone and ZIP then.
        </p>
        <p className="text-sm text-zinc-400 text-center mt-6">
          Already a member?{' '}
          <Link href={`/login?redirect=${encodeURIComponent(safeRedirect)}`} className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-xs text-zinc-500 text-center mt-4">
          By creating an account you agree to the{' '}
          <Link href="/terms" className="underline">Terms</Link> and{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

export default function MarketSignupPage() {
  return (
    <Suspense fallback={null}>
      <MarketSignupForm />
    </Suspense>
  );
}
