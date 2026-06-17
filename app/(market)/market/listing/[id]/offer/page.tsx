'use client';

import { useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ListingOfferPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const listingId = params.id as string;
  const isTrade = searchParams.get('trade') === '1';

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          offer_type: isTrade ? 'trade' : 'cash',
          amount_cents: isTrade ? undefined : Math.round(Number(amount) * 100),
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push(`/market/listing/${listingId}?offer=sent`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />
      <h1 className="text-2xl font-bold">{isTrade ? 'Offer a trade' : 'Make an offer'}</h1>
      <p className="text-sm text-muted-foreground">
        {isTrade
          ? 'Tell the owner what you want to trade. They can accept, decline, or counter.'
          : 'Your offer goes to the seller — vault listings are not buy-now.'}
      </p>

      {!isTrade ? (
        <div>
          <Label>Your offer ($)</Label>
          <Input
            className="mt-1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="104"
          />
        </div>
      ) : null}

      <div>
        <Label>Message (optional)</Label>
        <textarea
          className="w-full min-h-[100px] mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={isTrade ? 'I have JB Elite IV size 9.5…' : 'Happy to pay today if accepted.'}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full min-h-[48px] bg-accent text-black font-semibold rounded-full"
        onClick={submit}
        disabled={submitting || (!isTrade && !amount.trim())}
      >
        {submitting ? 'Sending…' : 'Send offer'}
      </Button>
    </div>
  );
}
