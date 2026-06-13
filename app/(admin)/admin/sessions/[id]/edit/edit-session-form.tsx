'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatEST } from '@/lib/format-date';
import { coachPayoutUsd, resolveCoachPayoutRate } from '@/lib/coach-session-payout';
import { Loader2, Trash2, MapPin } from 'lucide-react';
import { CoachNewLocationDialog } from '@/components/coach-new-location-dialog';
import type { CoachFacilityOption } from '@/lib/coach-facilities';

type Props = {
  sessionId: string;
  sessionStatus?: string;
  sessionType?: string;
  /** @deprecated Unused in UI; kept for page props compatibility */
  focusArea?: string;
  focusArea2?: string;
  joinPolicy: 'public' | 'private' | 'invite_only';
  maxParticipants: number;
  pricePerParticipant: number;
  currentParticipants: number;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number;
  facilityId?: string;
  facilities?: CoachFacilityOption[];
  coachId?: string;
  editable?: boolean;
  formMode?: 'admin' | 'coach';
  athletePayment?: number | null;
  athletePayoutDate?: string | null;
  participantAmountPaidSum?: number;
  sessionPayoutRate?: number | null;
  coachPayoutRate?: number | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">
      {children}
    </p>
  );
}

export function EditSessionForm({
  sessionId,
  sessionStatus,
  sessionType,
  joinPolicy,
  maxParticipants,
  pricePerParticipant,
  currentParticipants,
  scheduledDate: initialDate,
  scheduledTime: initialTime,
  durationMinutes: initialDurationMinutes = 60,
  facilityId: initialFacilityId = '',
  facilities: initialFacilities = [],
  coachId,
  editable = true,
  formMode = 'admin',
  athletePayment = null,
  athletePayoutDate = null,
  participantAmountPaidSum = 0,
  sessionPayoutRate = null,
  coachPayoutRate = null,
}: Props) {
  const router = useRouter();
  const isCoach = formMode === 'coach';
  const [sessionTypeState, setSessionTypeState] = useState(sessionType || 'small_group');
  const [join, setJoin] = useState(joinPolicy);
  const [max, setMax] = useState(String(maxParticipants));
  const [price, setPrice] = useState(String(pricePerParticipant));
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [durationMinutes, setDurationMinutes] = useState(
    [45, 60, 90].includes(initialDurationMinutes) ? initialDurationMinutes : 60
  );
  const [facilities, setFacilities] = useState<CoachFacilityOption[]>(initialFacilities);
  const [facilityId, setFacilityId] = useState(initialFacilityId);
  const [newLocationOpen, setNewLocationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [manualPaymentAmount, setManualPaymentAmount] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<'cash' | 'check' | 'venmo' | 'other'>('cash');
  const [manualPaymentLoading, setManualPaymentLoading] = useState(false);

  const coachShareRate = resolveCoachPayoutRate({
    session_payout_rate: sessionPayoutRate,
    coach_payout_rate: coachPayoutRate,
  });
  const coachSharePctLabel = `${(coachShareRate * 100).toFixed(1)}%`;

  function suggestedCoachPayoutAmount(): string {
    if (participantAmountPaidSum > 0) {
      return (participantAmountPaidSum * coachShareRate).toFixed(2);
    }
    return String(
      coachPayoutUsd({
        athlete_payment: athletePayment,
        price_per_participant: pricePerParticipant,
        current_participants: currentParticipants,
        participant_amount_paid_sum: participantAmountPaidSum,
        session_payout_rate: sessionPayoutRate,
        coach_payout_rate: coachPayoutRate,
      })
    );
  }

  const [payoutAmount, setPayoutAmount] = useState(() => {
    if (athletePayoutDate || sessionStatus !== 'completed') return '';
    return suggestedCoachPayoutAmount();
  });

  const wasCompletedOnMount = useRef(sessionStatus === 'completed');
  useEffect(() => {
    const nowCompleted = sessionStatus === 'completed';
    if (nowCompleted && !wasCompletedOnMount.current && !athletePayoutDate) {
      setPayoutAmount(suggestedCoachPayoutAmount());
    }
    wasCompletedOnMount.current = nowCompleted;
  }, [
    sessionStatus,
    athletePayoutDate,
    athletePayment,
    pricePerParticipant,
    currentParticipants,
    participantAmountPaidSum,
    sessionPayoutRate,
    coachPayoutRate,
  ]);

  const selectedFacility = facilities.find((f) => f.id === facilityId);

  const handleSessionTypeChange = (newType: string) => {
    setSessionTypeState(newType);
    if (newType === 'partner') setMax('2');
    else if (newType === 'private') setMax('1');
    else if (newType === 'small_group') setMax('6');
  };

  const handleLocationCreated = (facility: CoachFacilityOption) => {
    setFacilities((prev) => {
      if (prev.some((f) => f.id === facility.id)) return prev;
      return [...prev, facility].sort((a, b) => a.name.localeCompare(b.name));
    });
    setFacilityId(facility.id);
  };

  const maxMin =
    sessionTypeState === 'private'
      ? Math.max(1, currentParticipants)
      : sessionTypeState === 'partner'
        ? Math.max(2, currentParticipants)
        : Math.max(2, currentParticipants);
  const maxCap =
    sessionTypeState === 'partner' ? 2 : sessionTypeState === 'private' ? 1 : 20;

  const afterSavePath = isCoach ? '/athlete-dashboard' : '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    setError(null);
    const maxNum = Math.min(maxCap, Math.max(maxMin, parseInt(max, 10) || maxMin));
    if (maxNum < currentParticipants) {
      setError(`Max spots can't be less than ${currentParticipants} already registered`);
      return;
    }
    if (!facilityId && facilities.length > 0) {
      setError('Select a location');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_type: sessionTypeState,
          join_policy: join,
          max_participants: maxNum,
          price_per_participant: Math.max(0, parseFloat(price) || 0),
          scheduledDate: date,
          scheduledTime: time,
          duration_minutes: durationMinutes,
          ...(facilityId ? { facility_id: facilityId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update session');
        return;
      }
      router.push(afterSavePath);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{isCoach ? 'Edit session' : 'Session details'}</CardTitle>
          <CardDescription>
            {isCoach
              ? 'Update when, where, capacity, price, and who can sign up.'
              : 'Scheduled session fields (Eastern time).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {!editable && (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                Only scheduled sessions can be edited.
              </p>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-2">
              <Label htmlFor="session-type">Session type</Label>
              <Select value={sessionTypeState} onValueChange={handleSessionTypeChange} disabled={!editable}>
                <SelectTrigger id="session-type" className="min-h-[44px]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small_group">Small group</SelectItem>
                  <SelectItem value="partner">Partner (2 athletes)</SelectItem>
                  <SelectItem value="private">Private (1:1)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SectionLabel>When</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={!editable}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Time (ET)</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  disabled={!editable}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-duration">Duration</Label>
              <Select
                value={String(durationMinutes)}
                onValueChange={(v) => setDurationMinutes(Number(v))}
                disabled={!editable}
              >
                <SelectTrigger id="edit-duration" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SectionLabel>Where</SectionLabel>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="edit-facility">Location</Label>
                {editable && (isCoach || coachId) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-[#D4AF37] hover:text-[#D4AF37]"
                    onClick={() => setNewLocationOpen(true)}
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                    Add location
                  </Button>
                ) : null}
              </div>
              {facilities.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">
                  No locations yet. Tap Add location.
                </p>
              ) : (
                <Select
                  value={facilityId || undefined}
                  onValueChange={setFacilityId}
                  disabled={!editable}
                >
                  <SelectTrigger id="edit-facility" className="min-h-[44px]">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                        {f.address ? ` — ${f.address}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedFacility?.address ? (
                <p className="text-xs text-muted-foreground px-1">{selectedFacility.address}</p>
              ) : null}
              {(isCoach || coachId) && (
                <CoachNewLocationDialog
                  open={newLocationOpen}
                  onOpenChange={setNewLocationOpen}
                  onCreated={handleLocationCreated}
                  coachId={coachId}
                />
              )}
            </div>

            <SectionLabel>Registration</SectionLabel>
            <div className="space-y-2">
              <Label htmlFor="join">Who can sign up</Label>
              <Select
                value={join}
                onValueChange={(v) => setJoin(v as Props['joinPolicy'])}
                disabled={!editable}
              >
                <SelectTrigger id="join" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Anyone — open registration</SelectItem>
                  <SelectItem value="invite_only">Invite link required</SelectItem>
                  <SelectItem value="private">Hidden — you add wrestlers manually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="max">Max spots</Label>
                <Input
                  id="max"
                  type="number"
                  min={maxMin}
                  max={maxCap}
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  disabled={!editable}
                  className="min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">{currentParticipants} registered</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price per athlete ($)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!editable}
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="submit"
                disabled={loading || !editable}
                className={
                  isCoach
                    ? 'min-h-[48px] w-full bg-[#D4AF37] hover:bg-[#c9a432] text-black font-semibold'
                    : 'min-h-[44px]'
                }
              >
                {loading ? 'Saving…' : 'Save changes'}
              </Button>
              {sessionStatus === 'scheduled' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] w-full text-destructive border-destructive/60 hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isCoach && currentParticipants > 0}
                  title={
                    isCoach && currentParticipants > 0
                      ? 'Cancel from Schedule when families are registered'
                      : undefined
                  }
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete session
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {!isCoach && (
        <Card>
          <CardHeader>
            <CardTitle>Session financials</CardTitle>
            <CardDescription>
              Parent payments and coach payout ({coachSharePctLabel} suggested).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Parents paid</Label>
                <p className="text-xl font-semibold mt-1">${participantAmountPaidSum.toFixed(2)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Suggested payout</Label>
                <p className="text-xl font-semibold mt-1 text-blue-400">
                  ${(participantAmountPaidSum * coachShareRate).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div>
                <Label className="text-muted-foreground text-xs">Guild net</Label>
                <p
                  className={`text-xl font-semibold mt-1 ${(participantAmountPaidSum - (athletePayment ?? 0)) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  ${(participantAmountPaidSum - (athletePayment ?? 0)).toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Recorded payout</Label>
                <p className="text-xl font-semibold mt-1">
                  {athletePayment != null ? `$${Number(athletePayment).toFixed(2)}` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {athletePayoutDate
                    ? `Paid ${formatEST(`${athletePayoutDate}T12:00:00`, 'MMM d, yyyy')}`
                    : 'Not yet paid'}
                </p>
              </div>
            </div>
            {participantAmountPaidSum === 0 && currentParticipants > 0 ? (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm">
                <p className="font-medium text-amber-500">Gross revenue is $0</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Add a manual payment below if parents paid outside Stripe.
                </p>
              </div>
            ) : null}
            <div className="pt-4 border-t border-border">
              <Label className="text-sm font-medium">Add manual payment</Label>
              <form
                className="flex flex-wrap items-end gap-3 mt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = parseFloat(manualPaymentAmount);
                  if (Number.isNaN(val) || val <= 0) return;
                  setManualPaymentLoading(true);
                  setError(null);
                  try {
                    const res = await fetch(`/api/admin/sessions/${sessionId}/add-payment`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        amount: val,
                        paymentMethod: manualPaymentMethod,
                        notes: `Manual ${manualPaymentMethod} payment`,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      router.refresh();
                      setManualPaymentAmount('');
                    } else {
                      setError(data.error || 'Failed to add payment');
                    }
                  } catch {
                    setError('Failed to add payment');
                  } finally {
                    setManualPaymentLoading(false);
                  }
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="manual-amount" className="text-xs">
                    Amount ($)
                  </Label>
                  <Input
                    id="manual-amount"
                    type="number"
                    min={0}
                    step={1}
                    value={manualPaymentAmount}
                    onChange={(e) => setManualPaymentAmount(e.target.value)}
                    className="w-24"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manual-method" className="text-xs">
                    Method
                  </Label>
                  <Select
                    value={manualPaymentMethod}
                    onValueChange={(v) => setManualPaymentMethod(v as typeof manualPaymentMethod)}
                  >
                    <SelectTrigger id="manual-method" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="venmo">Venmo</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={manualPaymentLoading || manualPaymentAmount.trim() === ''}
                >
                  {manualPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {sessionStatus === 'scheduled' && isCoach ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">After the session</CardTitle>
            <CardDescription>Mark complete when wrestlers have finished.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="min-h-[44px] w-full"
              disabled={completeLoading}
              onClick={async () => {
                setCompleteLoading(true);
                setError(null);
                try {
                  const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    router.refresh();
                  } else {
                    setError(data.error || 'Failed to mark complete');
                  }
                } catch {
                  setError('Failed to mark complete');
                } finally {
                  setCompleteLoading(false);
                }
              }}
            >
              {completeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Marking…
                </>
              ) : (
                'Mark as completed'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isCoach && sessionStatus === 'scheduled' ? (
        <Card>
          <CardHeader>
            <CardTitle>1 · Mark session complete</CardTitle>
            <CardDescription>Record that this session happened before payout.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="default"
              disabled={completeLoading}
              onClick={async () => {
                setCompleteLoading(true);
                setError(null);
                try {
                  const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    router.refresh();
                  } else {
                    setError(data.error || 'Failed to mark complete');
                  }
                } catch {
                  setError('Failed to mark complete');
                } finally {
                  setCompleteLoading(false);
                }
              }}
            >
              {completeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Marking…
                </>
              ) : (
                'Mark as completed'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isCoach ? (
        <Card className={sessionStatus !== 'completed' ? 'opacity-90' : undefined}>
          <CardHeader>
            <CardTitle>2 · Record coach payout</CardTitle>
            <CardDescription>
              {athletePayoutDate
                ? 'This session is already marked paid.'
                : sessionStatus !== 'completed'
                  ? 'Complete step 1 first.'
                  : 'Enter what you paid the coach.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {athletePayoutDate ? (
              <p className="text-sm text-muted-foreground">
                Paid{' '}
                <span className="font-medium text-foreground">
                  {formatEST(`${athletePayoutDate}T12:00:00`, 'MMM d, yyyy')}
                </span>
                {athletePayment != null && Number(athletePayment) > 0
                  ? ` · $${Number(athletePayment).toFixed(2)}`
                  : ''}
              </p>
            ) : sessionStatus !== 'completed' ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
                Mark the session complete first.
              </p>
            ) : (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = parseFloat(payoutAmount);
                  if (Number.isNaN(val) || val < 0) return;
                  setPayoutLoading(true);
                  setError(null);
                  try {
                    const res = await fetch('/api/admin/record-session-payout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionIds: [sessionId], amount: val }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      router.refresh();
                      setPayoutAmount('');
                    } else {
                      setError(data.error || 'Failed to record payout');
                    }
                  } catch {
                    setError('Failed to record payout');
                  } finally {
                    setPayoutLoading(false);
                  }
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="payout-amount">Coach payout ($)</Label>
                  <Input
                    id="payout-amount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-28"
                  />
                </div>
                <Button type="submit" disabled={payoutLoading || payoutAmount.trim() === ''}>
                  {payoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record payout'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              {isCoach && currentParticipants > 0
                ? 'Sessions with registrations cannot be deleted here — cancel from Schedule to credit families.'
                : 'This permanently deletes the session and all registrations.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDeleteLoading(true);
                try {
                  const res = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || 'Failed to delete session');
                    setShowDeleteConfirm(false);
                    return;
                  }
                  router.push(afterSavePath);
                  router.refresh();
                } catch {
                  setError('Failed to delete session');
                  setShowDeleteConfirm(false);
                } finally {
                  setDeleteLoading(false);
                }
              }}
              disabled={deleteLoading}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
