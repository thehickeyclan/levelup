'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { isValidUsZipCode } from '@/lib/us-zip';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND',
  'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

const addressSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  line1: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required'),
  zip: z.string().refine(isValidUsZipCode, 'Enter a valid ZIP code'),
});

export type CheckoutSummary = {
  listingId: string;
  orderId: string | null;
  title: string;
  brand: string;
  model: string;
  size: number;
  selectedSizeUs: number | null;
  condition: string;
  wearState: string | null;
  sellerName: string;
  imageUrl: string | null;
  amountCents: number;
  shippingCents: number;
};

export function ListingCheckoutClient({ summary }: { summary: CheckoutSummary }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof addressSchema>>({
    resolver: zodResolver(addressSchema),
    defaultValues: { name: '', line1: '', city: '', state: '', zip: '' },
  });

  const wear = (summary.wearState as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
  const conditionLabel = listingConditionDisplay(wear, summary.condition);
  const totalCents = summary.amountCents + summary.shippingCents;
  const displayTitle = summary.model?.trim() || summary.title;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/market/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: summary.listingId,
          orderId: summary.orderId ?? undefined,
          sizeUs: summary.selectedSizeUs ?? undefined,
          shippingAddress: {
            name: values.name,
            line1: values.line1,
            city: values.city,
            state: values.state,
            zip: values.zip,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      router.push('/market/orders?success=true');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6 bg-background">
      <BackLink fallbackHref={`/market/listing/${summary.listingId}`} label="Back to listing" />

      <div className="flex gap-3 rounded-xl border border-border bg-card/80 p-3">
        <div className="w-20 h-20 rounded-xl bg-card shrink-0 overflow-hidden">
          {summary.imageUrl ? (
            <img src={summary.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{displayTitle}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Size {summary.size} · {conditionLabel}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Seller: {summary.sellerName}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Item</span>
          <span>${(summary.amountCents / 100).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shipping</span>
          <span>${(summary.shippingCents / 100).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Platform fee</span>
          <span>$0.00 to you</span>
        </div>
        <div className="flex justify-between font-bold text-accent pt-2 border-t border-border">
          <span>Total</span>
          <span>${(totalCents / 100).toFixed(2)}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm font-medium text-foreground/80">Shipping address</p>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" className="mt-1" {...form.register('name')} />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="line1">Address line 1</Label>
          <Input id="line1" className="mt-1" {...form.register('line1')} />
          {form.formState.errors.line1 ? (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.line1.message}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" className="mt-1" {...form.register('city')} />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <select
              id="state"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...form.register('state')}
            >
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="zip">ZIP</Label>
          <Input id="zip" className="mt-1" {...form.register('zip')} />
        </div>

        <p className="text-xs text-muted-foreground">
          You&apos;ll be taken to Stripe to complete payment securely.
        </p>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent">
          <Button
            type="submit"
            className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold rounded-full"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Redirecting…
              </>
            ) : (
              'Place market order'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
