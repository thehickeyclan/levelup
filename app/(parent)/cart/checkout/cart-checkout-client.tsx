'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShoppingCart, X, CreditCard, Loader2, Wallet, Tag, Check, AlertCircle, Sparkles } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCart } from '@/lib/cart-context';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { useAutoAssignSoloWrestler } from '@/lib/hooks/use-auto-assign-solo-wrestler';
import { Switch } from '@/components/ui/switch';
import { WaiverCheckbox } from '@/components/waiver-checkbox';
const fetcher = (url: string) => fetch(url).then(r => r.json());

type Wrestler = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

export function CartCheckoutClient({
  wrestlers: initialWrestlers,
  userEmail,
  checkoutUsesSavedAccountDiscount,
  existingDiscount,
}: {
  wrestlers: Wrestler[];
  userEmail: string;
  checkoutUsesSavedAccountDiscount: boolean;
  existingDiscount?: number;
}) {
  const router = useRouter();
  const { items, removeItem, clearCart, setAthleteForItem, total, count } = useCart();
  const { data: wrestlersRes } = useSWR<{ wrestlers: Wrestler[] }>('/api/wrestlers', fetcher);
  const wrestlers = useMemo(
    () => (wrestlersRes?.wrestlers?.length ? wrestlersRes.wrestlers : initialWrestlers),
    [wrestlersRes?.wrestlers, initialWrestlers]
  );
  useAutoAssignSoloWrestler(items, wrestlers, setAthleteForItem);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<number>(existingDiscount ?? 0);
  const [promoApplied, setPromoApplied] = useState((existingDiscount ?? 0) > 0);
  const [useCredits, setUseCredits] = useState(true);
  const [waiverChecked, setWaiverChecked] = useState(false);

  const allLinesHaveWrestler = items.length > 0 && items.every((i) => Boolean(i.athlete_id));

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('cart_use_credits');
      if (v === '0') setUseCredits(false);
      if (v === '1') setUseCredits(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch credit balance
  const { data: creditsData } = useSWR('/api/credits', fetcher);
  const creditBalance = creditsData?.balance ?? 0;
  
  // Calculate totals with discount
  const discountAmount = appliedDiscount > 0 ? total * (appliedDiscount / 100) : 0;
  const subtotalAfterDiscount = total - discountAmount;
  const creditsToApply = useCredits ? Math.min(creditBalance, subtotalAfterDiscount) : 0;
  const amountToPay = subtotalAfterDiscount - creditsToApply;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;

    setPromoLoading(true);
    setPromoError(null);

    try {
      if (checkoutUsesSavedAccountDiscount) {
        const res = await fetch('/api/redeem-discount-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPromoError(data.error || 'Invalid promo code');
          return;
        }
        setAppliedDiscount(data.percent_off);
        setPromoApplied(true);
        setPromoError(null);
        return;
      }

      const res = await fetch('/api/checkout/validate-promo-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || 'Invalid promo code');
        return;
      }
      setAppliedDiscount(data.percent_off);
      setPromoApplied(true);
      setPromoError(null);
    } catch {
      setPromoError('Failed to apply promo code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      setError('Your cart is empty');
      return;
    }
    if (!allLinesHaveWrestler) {
      setError('Select a wrestler for each spot above.');
      return;
    }

    const lines = items
      .filter((i) => i.athlete_id)
      .map((i) => ({ sessionId: i.id, wrestlerId: i.athlete_id as string }));
    const pairKeys = new Set(lines.map((l) => `${l.sessionId}:${l.wrestlerId}`));
    if (pairKeys.size !== lines.length) {
      setError('Each spot must be for a different wrestler when booking the same session twice.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const promoPayload =
        !checkoutUsesSavedAccountDiscount && promoApplied && promoCode.trim()
          ? promoCode.trim().toUpperCase()
          : undefined;

      const res = await fetch('/api/cart/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, promoCode: promoPayload, useCredits, waiverAccepted: waiverChecked }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Checkout failed');
        return;
      }

      // If paid with credits entirely, redirect to success
      if (data.paidWithCredits && data.redirectUrl) {
        clearCart();
        router.push(data.redirectUrl);
        return;
      }

      // Redirect to Stripe checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (count === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground mb-6">Add sessions from the Training page to get started.</p>
          <Button asChild>
            <Link href="/training">Browse Training</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackLink
          fallbackHref="/training"
          label="Back to Training"
          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Checkout ({count} spot{count !== 1 ? 's' : ''})
          </CardTitle>
          <CardDescription>
            Review each spot and complete payment in one transaction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {wrestlers.length === 0 && items.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Add a wrestler profile to your account, or{' '}
              <Link href="/cart" className="underline font-medium">
                return to the cart
              </Link>{' '}
              to review.
            </p>
          )}

          {/* Session List */}
          <div className="space-y-3">
            <Label>Sessions</Label>
            <div className="border border-border rounded-lg divide-y divide-border">
              {items.map((item) => {
                const dt = new Date(item.scheduled_datetime);
                const dayName = formatEST(dt, 'EEE');
                const { label: typeLabel } = getSessionTypeDisplay(item.session_type, null);
                const takenForThisSession = items
                  .filter((o) => o.id === item.id && o.lineId !== item.lineId)
                  .map((o) => o.athlete_id)
                  .filter(Boolean) as string[];
                const availableWrestlers = wrestlers.filter(
                  (kid) => !takenForThisSession.includes(kid.id) || kid.id === item.athlete_id
                );
                const needsSelection =
                  wrestlers.length > 0 &&
                  !item.athlete_id &&
                  (wrestlers.length > 1 || availableWrestlers.length === 0);

                return (
                  <div
                    key={item.lineId}
                    className="flex items-start gap-3 p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {dayName}, {formatEST(dt, 'MMM d, yyyy')} · {formatEST(dt, 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.coach_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {typeLabel}
                      </p>
                      {wrestlers.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Booking for
                          </p>
                          {wrestlers.length === 1 && availableWrestlers.length > 0 ? (
                            <p className="text-sm text-foreground">
                              {[wrestlers[0].first_name, wrestlers[0].last_name].filter(Boolean).join(' ')}
                            </p>
                          ) : availableWrestlers.length > 0 ? (
                            <Select
                              value={item.athlete_id || ''}
                              onValueChange={(value) => setAthleteForItem(item.lineId, value)}
                            >
                              <SelectTrigger className={needsSelection ? 'border-amber-500/60' : ''}>
                                <SelectValue placeholder="Select wrestler" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableWrestlers.map((kid) => (
                                  <SelectItem key={kid.id} value={kid.id}>
                                    {[kid.first_name, kid.last_name].filter(Boolean).join(' ') || 'Wrestler'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                              No wrestler left for this spot — adjust the other line or remove a duplicate.
                            </p>
                          )}
                          {needsSelection && availableWrestlers.length > 0 && (
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              <span>Select which wrestler this spot is for</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        ${Number(item.price_per_participant ?? 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.lineId)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                        aria-label="Remove from cart"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Promo Code */}
          <div className="space-y-2">
            <Label htmlFor="promo">
              {checkoutUsesSavedAccountDiscount ? 'Promo Code' : 'Promo code (required for discount — Apply, then pay)'}
            </Label>
            {promoApplied ? (
              <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/20 rounded-lg">
                <Check className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-accent">
                  {appliedDiscount}% discount applied
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="promo"
                  placeholder="Enter code"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoApplied(false);
                    if (!checkoutUsesSavedAccountDiscount) {
                      setAppliedDiscount(0);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleApplyPromo}
                  disabled={promoLoading || !promoCode.trim()}
                >
                  {promoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Tag className="h-4 w-4 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
              </div>
            )}
            {promoError && (
              <p className="text-xs text-destructive">{promoError}</p>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${total.toFixed(2)}</span>
            </div>
            
            {appliedDiscount > 0 && (
              <div className="flex items-center justify-between text-accent">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-4 w-4" />
                  Promo ({appliedDiscount}% off)
                </span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            
            {creditBalance > 0 && (
              <div className="space-y-2 rounded-lg border border-accent/20 bg-accent/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-accent" />
                    Apply earned credits
                  </span>
                  <Switch
                    checked={useCredits}
                    onCheckedChange={(c) => {
                      setUseCredits(c);
                      try {
                        sessionStorage.setItem('cart_use_credits', c ? '1' : '0');
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>
                {useCredits && creditsToApply > 0 && (
                  <div className="flex items-center justify-between text-accent text-sm">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" />
                      Credit applied
                    </span>
                    <span>-${creditsToApply.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-lg font-medium">Total due</span>
              <span className="text-2xl font-bold">${amountToPay.toFixed(2)}</span>
            </div>

            {creditBalance > 0 && creditsToApply < creditBalance && (
              <p className="text-xs text-muted-foreground">
                Remaining credit balance after purchase: ${(creditBalance - creditsToApply).toFixed(2)}
              </p>
            )}
            
            {appliedDiscount > 0 && creditBalance === 0 && (
              <p className="text-xs text-muted-foreground">
                You saved ${discountAmount.toFixed(2)} with your promo code!
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="mb-3">
            <WaiverCheckbox checked={waiverChecked} onChange={setWaiverChecked} />
          </div>
          {/* Checkout Button */}
          <Button
            onClick={handleCheckout}
            disabled={loading || !allLinesHaveWrestler || !waiverChecked}
            className="w-full min-h-[48px] text-base gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : amountToPay <= 0 ? (
              <>
                <Wallet className="h-5 w-5" />
                Pay with Credit
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Pay ${amountToPay.toFixed(2)}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {amountToPay <= 0 
              ? 'Your credit balance covers this purchase'
              : creditsToApply > 0
                ? `$${creditsToApply.toFixed(2)} credit applied. You'll pay $${amountToPay.toFixed(2)} via Stripe.`
                : 'You will be redirected to Stripe to complete payment'
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
