'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { ShoppingCart, X, Calendar, MapPin, User, ChevronRight, Wallet, Sparkles, AlertCircle, ChevronDown } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { formatEST } from '@/lib/format-date';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { useState, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAutoAssignSoloWrestler } from '@/lib/hooks/use-auto-assign-solo-wrestler';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type Wrestler = {
  id: string;
  first_name: string;
  last_name: string;
};

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, setAthleteForItem, total, count, isLoading } = useCart();
  const [useCredits, setUseCredits] = useState(true);

  // Fetch credit balance
  const { data: creditsData } = useSWR('/api/credits', fetcher);
  const creditBalance = creditsData?.balance ?? 0;
  const creditsToApply = useCredits ? Math.min(creditBalance, total) : 0;
  const amountToPay = total - creditsToApply;

  // Fetch parent's wrestlers
  const { data: wrestlersData } = useSWR<{ wrestlers: Wrestler[] }>('/api/wrestlers', fetcher);
  const wrestlers = useMemo(() => wrestlersData?.wrestlers ?? [], [wrestlersData]);
  useAutoAssignSoloWrestler(items, wrestlers, setAthleteForItem);

  // Check if all items have an athlete assigned
  const allItemsHaveAthlete = items.every((item) => item.athlete_id);
  const canCheckout = items.length > 0 && allItemsHaveAthlete;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading cart...</div>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-foreground">Cart</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
          <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mb-6">
            <ShoppingCart className="h-10 w-10 text-zinc-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-zinc-500 text-center mb-8 max-w-xs">
            Browse training sessions and add them to your cart to book
          </p>
          <Button asChild className="bg-accent hover:bg-[#C4A030] text-black font-semibold px-8">
            <Link href="/training">Find Training</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-40">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Cart</h1>
        <p className="text-zinc-500 text-sm mt-0.5">{count} spot{count !== 1 ? 's' : ''}</p>
      </div>

      {/* Session List */}
      <div className="px-4 space-y-3">
        {items.map((item) => {
          const dt = new Date(item.scheduled_datetime);
          const takenForThisSession = items
            .filter((o) => o.id === item.id && o.lineId !== item.lineId)
            .map((o) => o.athlete_id)
            .filter(Boolean) as string[];
          const availableWrestlers = wrestlers.filter(
            (w) => !takenForThisSession.includes(w.id) || w.id === item.athlete_id
          );
          const needsSelection =
            !item.athlete_id && (wrestlers.length > 1 || availableWrestlers.length === 0);

          return (
            <div
              key={item.lineId}
              className="relative bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 group"
            >
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeItem(item.lineId)}
                className="absolute top-3 right-3 p-2 text-zinc-500 hover:text-red-400 transition-colors rounded-full hover:bg-red-500/10"
                aria-label="Remove from cart"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Session type badge */}
              <div className="mb-3">
                <SessionTypeBadge 
                  sessionType={item.session_type} 
                  sessionMode={null} 
                />
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-accent" />
                <span className="font-semibold">
                  {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
                </span>
              </div>

              {/* Coach */}
              <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                <User className="h-3.5 w-3.5" />
                <span>{item.coach_name}</span>
              </div>

              {/* Facility */}
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <MapPin className="h-3.5 w-3.5" />
                <span>{item.facility_name}</span>
              </div>

              {/* Athlete Selection */}
              {wrestlers.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <label className="text-sm text-zinc-500 mb-2 block">Booking for</label>
                  {wrestlers.length === 1 && availableWrestlers.length > 0 ? (
                    <div className="flex items-center gap-2 text-foreground">
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent">
                        {wrestlers[0].first_name.charAt(0)}
                      </div>
                      <span className="font-medium">{wrestlers[0].first_name} {wrestlers[0].last_name}</span>
                    </div>
                  ) : availableWrestlers.length > 0 ? (
                    <Select
                      value={item.athlete_id || ''}
                      onValueChange={(value) => setAthleteForItem(item.lineId, value)}
                    >
                      <SelectTrigger className={`w-full ${needsSelection ? 'border-amber-500/50' : ''}`}>
                        <SelectValue placeholder="Select wrestler" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWrestlers.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.first_name} {w.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-amber-500">
                      No wrestler left for this spot — remove a duplicate line or pick a different session.
                    </p>
                  )}
                  {needsSelection && availableWrestlers.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-amber-500 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      <span>Select which wrestler this spot is for</span>
                    </div>
                  )}
                </div>
              )}

              {/* Price */}
              <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-sm text-zinc-500">Price</span>
                <span className="text-lg font-bold">${Number(item.price_per_participant ?? 0).toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Wallet Credits Toggle */}
      {creditBalance > 0 && (
        <div className="px-4 mt-6">
          <div className="bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <Wallet className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Use Wallet Credit</p>
                  <p className="text-sm text-zinc-400">
                    ${creditBalance.toFixed(2)} available
                  </p>
                </div>
              </div>
              <Switch
                checked={useCredits}
                onCheckedChange={setUseCredits}
                className="data-[state=checked]:bg-accent"
              />
            </div>
            {useCredits && creditsToApply > 0 && (
              <div className="mt-3 pt-3 border-t border-accent/20 flex items-center gap-2 text-accent">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">
                  -${creditsToApply.toFixed(2)} will be applied
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed Bottom Checkout Bar - above bottom nav on mobile */}
      <div className="fixed bottom-20 md:bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-zinc-800 p-4 z-40">
        <div className="max-w-lg mx-auto">
          {/* Warning if not all items have athlete */}
          {!allItemsHaveAthlete && (
            <div className="flex items-center gap-2 text-amber-500 text-sm mb-3">
              <AlertCircle className="h-4 w-4" />
              <span>Select a wrestler for each spot</span>
            </div>
          )}
          
          {/* Totals */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Total</p>
              <div className="flex items-baseline gap-2">
                {creditsToApply > 0 && (
                  <span className="text-sm text-zinc-500 line-through">${total.toFixed(2)}</span>
                )}
                <span className="text-2xl font-bold">${amountToPay.toFixed(2)}</span>
              </div>
            </div>
            <Button 
              onClick={() => {
                try {
                  sessionStorage.setItem('cart_use_credits', useCredits ? '1' : '0');
                } catch {
                  /* ignore */
                }
                router.push('/cart/checkout');
              }}
              disabled={!canCheckout}
              className="bg-accent hover:bg-[#C4A030] text-black font-semibold px-8 h-12 text-base gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Checkout
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
