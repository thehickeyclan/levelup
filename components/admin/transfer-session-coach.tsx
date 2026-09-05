'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type CoachOption = { id: string; name: string };

/**
 * Admin-only card on the session edit page: hand a scheduled session to a
 * different coach. Roster and payments carry over; families and both coaches
 * get notified by the API.
 */
export function TransferSessionCoach({
  sessionId,
  currentCoachName,
  coaches,
}: {
  sessionId: string;
  currentCoachName: string;
  coaches: CoachOption[];
}) {
  const router = useRouter();
  const [newCoachId, setNewCoachId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = coaches.find((c) => c.id === newCoachId);

  async function transfer() {
    if (!selected) return;
    if (
      !window.confirm(
        `Transfer this session from ${currentCoachName} to ${selected.name}? Families keep their spots and payments; everyone is notified.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/transfer-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newCoachId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Transfer failed');
        return;
      }
      setMessage(data.message || 'Transferred.');
      setNewCoachId('');
      router.refresh();
    } catch {
      setMessage('Transfer failed — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Transfer to another coach
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Coach conflict? Hand the whole session to a sub — roster and payments carry over, families
        and both coaches are notified automatically.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={newCoachId}
          onChange={(e) => setNewCoachId(e.target.value)}
          disabled={busy}
        >
          <option value="">Choose new coach…</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void transfer()}
          disabled={!newCoachId || busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Transferring…' : 'Transfer session'}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
