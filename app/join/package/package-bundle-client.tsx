'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCart, type CartSession } from '@/lib/cart-context';
import { formatEST } from '@/lib/format-date';
import { MapPin } from 'lucide-react';

export type PackageSessionRow = {
  sessionId: string;
  inviteCode: string;
  scheduled_datetime: string;
  session_type: string | null;
  price_per_participant: number;
  coach_name: string;
  coach_id: string;
  facility_name: string;
};

type Props = {
  sessions: PackageSessionRow[];
};

export function PackageBundleClient({ sessions }: Props) {
  const router = useRouter();
  const { replaceAllItems } = useCart();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sessions.map((s) => s.sessionId)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSessions = useMemo(
    () => sessions.filter((s) => selected.has(s.sessionId)),
    [sessions, selected]
  );

  const selectedTotal = useMemo(
    () => selectedSessions.reduce((sum, s) => sum + s.price_per_participant, 0),
    [selectedSessions]
  );

  const allSelected = selected.size === sessions.length;
  const noneSelected = selected.size === 0;

  const toggleSession = (sessionId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
    setError(null);
  };

  const selectAll = () => setSelected(new Set(sessions.map((s) => s.sessionId)));
  const clearAll = () => setSelected(new Set());

  const handleCheckout = () => {
    if (selectedSessions.length === 0) {
      setError('Select at least one session to continue.');
      return;
    }
    setLoading(true);
    setError(null);

    const lines: CartSession[] = selectedSessions.map((s) => ({
      lineId: crypto.randomUUID(),
      id: s.sessionId,
      scheduled_datetime: s.scheduled_datetime,
      session_type: s.session_type,
      price_per_participant: s.price_per_participant,
      coach_name: s.coach_name,
      coach_id: s.coach_id,
      facility_name: s.facility_name,
    }));

    try {
      replaceAllItems(lines);
      router.push('/cart/checkout');
    } catch {
      setError('Could not prepare checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {selected.size} of {sessions.length} selected
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={selectAll} disabled={allSelected}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll} disabled={noneSelected}>
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {sessions.map((s) => {
          const dt = new Date(s.scheduled_datetime);
          const isChecked = selected.has(s.sessionId);
          return (
            <label
              key={s.sessionId}
              htmlFor={`pkg-${s.sessionId}`}
              className={`flex gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                isChecked ? 'border-accent/50 bg-accent/5' : 'border-border/60 bg-muted/20'
              }`}
            >
              <Checkbox
                id={`pkg-${s.sessionId}`}
                checked={isChecked}
                onCheckedChange={(v) => toggleSession(s.sessionId, v === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-foreground">{s.coach_name}</p>
                <p className="text-muted-foreground">
                  {formatEST(dt, 'EEE, MMM d, yyyy')} at {formatEST(dt, 'h:mm a')}
                </p>
                {s.facility_name && (
                  <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {s.facility_name}
                  </p>
                )}
                <p className="text-foreground font-semibold mt-1">${s.price_per_participant.toFixed(2)}</p>
              </div>
            </label>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="sticky bottom-0 -mx-1 border-t border-border bg-card pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {selectedSessions.length} session{selectedSessions.length !== 1 ? 's' : ''} · one checkout
          </span>
          <span className="text-xl font-bold text-foreground">${selectedTotal.toFixed(2)}</span>
        </div>
        <Button
          type="button"
          onClick={handleCheckout}
          disabled={noneSelected || loading}
          className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-medium"
        >
          {loading ? 'Preparing checkout…' : `Checkout — $${selectedTotal.toFixed(2)}`}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Uncheck any sessions you do not want. You pay once for everything selected.
        </p>
      </div>
    </div>
  );
}
