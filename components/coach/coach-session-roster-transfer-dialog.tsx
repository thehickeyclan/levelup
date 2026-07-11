'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatEST } from '@/lib/format-date';
import type { CoachTransferSessionOption } from '@/lib/coach-transfer-session-options';

export type CoachSessionRosterRow = {
  id: string;
  wrestlerId?: string | null;
  wrestlerName: string;
  photoUrl?: string | null;
  paid: boolean;
  amountPaid: number;
  isDropIn?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionLabel: string;
  transferSessionOptions: CoachTransferSessionOption[];
};

export function CoachSessionRosterTransferDialog({
  open,
  onOpenChange,
  sessionId,
  sessionLabel,
  transferSessionOptions,
}: Props) {
  const router = useRouter();
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterData, setRosterData] = useState<CoachSessionRosterRow[]>([]);
  const [transferringParticipant, setTransferringParticipant] = useState<CoachSessionRosterRow | null>(
    null
  );
  const [transferTargetSessionId, setTransferTargetSessionId] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const loadRoster = async () => {
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/roster`);
      const data = await res.json();
      if (!res.ok) {
        setRosterData([]);
        window.alert(data.error || 'Could not load roster');
        return;
      }
      setRosterData(data.roster || []);
    } catch {
      setRosterData([]);
    } finally {
      setRosterLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (next) {
      setTransferringParticipant(null);
      setTransferTargetSessionId('');
      void loadRoster();
    }
  };

  const handleTransfer = async () => {
    if (!transferringParticipant || !transferTargetSessionId) return;
    setTransferLoading(true);
    try {
      const res = await fetch('/api/coach/sessions/transfer-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: transferringParticipant.id,
          fromSessionId: sessionId,
          toSessionId: transferTargetSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Transfer failed');
        return;
      }
      window.alert(
        transferringParticipant.paid
          ? `Moved ${transferringParticipant.wrestlerName} — $${Number(transferringParticipant.amountPaid || 0).toFixed(2)} payment preserved.`
          : `Moved ${transferringParticipant.wrestlerName}. Parent may still need to complete checkout on the new session.`
      );
      setTransferringParticipant(null);
      setTransferTargetSessionId('');
      await loadRoster();
      router.refresh();
    } catch (err) {
      window.alert('Transfer failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTransferLoading(false);
    }
  };

  const targetOptions = transferSessionOptions;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Move athlete to another session
          </DialogTitle>
          <DialogDescription>{sessionLabel}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {rosterLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rosterData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No athletes registered</p>
          ) : (
            <div className="space-y-3">
              {rosterData.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="w-6 font-medium text-muted-foreground">{idx + 1}.</div>
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {p.wrestlerName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {p.wrestlerName}
                      {p.isDropIn ? (
                        <Badge variant="outline" className="text-xs">
                          Drop-in
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="font-medium tabular-nums">
                        ${Number(p.amountPaid || 0).toFixed(2)}
                      </div>
                      {p.paid ? (
                        <Badge variant="outline" className="border-emerald-600/50 bg-emerald-600/10 text-xs">
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-600/50 bg-amber-600/10 text-xs">
                          Pending
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-accent"
                      disabled={targetOptions.length === 0}
                      onClick={() => {
                        setTransferringParticipant(p);
                        setTransferTargetSessionId('');
                      }}
                    >
                      Move
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {transferringParticipant ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 font-medium">
                Move {transferringParticipant.wrestlerName} ($
                {Number(transferringParticipant.amountPaid || 0).toFixed(2)}{' '}
                {transferringParticipant.paid ? 'paid' : 'pending'})
              </div>
              <div className="space-y-2">
                <Label htmlFor="coach-transfer-target">Open session</Label>
                <select
                  id="coach-transfer-target"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={transferTargetSessionId}
                  onChange={(e) => setTransferTargetSessionId(e.target.value)}
                >
                  <option value="">Select a session…</option>
                  {targetOptions.slice(0, 30).map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatEST(new Date(s.scheduled_datetime), 'MMM d h:mm a')} · {s.facilityLabel} (
                      {s.current_participants}/{s.max_participants})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTransferringParticipant(null);
                    setTransferTargetSessionId('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!transferTargetSessionId || transferLoading}
                  onClick={handleTransfer}
                >
                  {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm move'}
                </Button>
              </div>
            </div>
          ) : null}

          {targetOptions.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No other open sessions on your schedule. Create one first, then you can move athletes
              between your slots.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
