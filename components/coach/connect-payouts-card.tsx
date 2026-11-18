'use client';

import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Automatic-payouts setup card on Coach Earnings. Rendered only when
 * STRIPE_CONNECT_ENABLED and the coach isn't fully onboarded yet; once
 * payouts are active the parent page shows the active badge instead.
 * Copy promises what Stripe actually does: sent on completion, in the
 * bank in about 2 business days — never "instant".
 */
export function ConnectPayoutsCard({ status }: { status: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resume = status === 'onboarding' || status === 'pending';

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/connect/onboard', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start payout setup');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payout setup');
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-accent" />
        <p className="text-sm font-semibold">Automatic payouts</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {resume
          ? 'Finish your payout setup — once active, your share is sent the moment you complete a session and reaches your bank in about 2 business days.'
          : 'Connect your bank once. Your share is sent the moment you complete a session and reaches your bank in about 2 business days — no invoices, nothing to chase.'}
      </p>
      <Button onClick={start} disabled={loading} className="w-full min-h-[44px] font-semibold">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Opening…
          </>
        ) : resume ? (
          'Finish payout setup'
        ) : (
          'Set up automatic payouts'
        )}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
