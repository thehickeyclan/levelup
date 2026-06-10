'use client';

import { useState, useEffect, useRef } from 'react';
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
import { SESSION_FOCUS_AREAS } from '@/lib/focus-areas';
import { formatEST } from '@/lib/format-date';
import { coachPayoutUsd, resolveCoachPayoutRate } from '@/lib/coach-session-payout';
import { Loader2, Trash2, MapPin } from 'lucide-react';
import { CoachNewLocationDialog } from '@/components/coach-new-location-dialog';
import type { CoachFacilityOption } from '@/lib/coach-facilities';

type Props = {
  sessionId: string;
  sessionStatus?: string;
  sessionType?: string;
  focusArea: string;
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
  /** False once the session has started or is no longer scheduled */
  editable?: boolean;
  /** Coach UI hides org financial tools */
  formMode?: 'admin' | 'coach';
  /** Gross coach payout for this session (from bookings), if any */
  athletePayment?: number | null;
  /** YYYY-MM-DD when payout was marked paid */
  athletePayoutDate?: string | null;
  /** Sum of session_participants.amount_paid (parent $ after discounts) */
  participantAmountPaidSum?: number;
  /** Session snapshot; used with coach rate for suggested payout % */
  sessionPayoutRate?: number | null;
  coachPayoutRate?: number | null;
};

export function EditSessionForm({
  sessionId,
  sessionStatus,
  sessionType,
  focusArea,
  focusArea2 = '',
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
  const [sessionTypeState, setSessionTypeState] = useState(sessionType || 'small_group');
  const [focus, setFocus] = useState(focusArea);
  const [focus2, setFocus2] = useState(focusArea2);
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
  
  // Session type presets for auto-fill
  const SESSION_PRESETS = {
    small_group: { label: 'Small Group', price: 30, maxParticipants: 6 },
    partner: { label: 'Partner Session', price: 50, maxParticipants: 2 },
    private: { label: 'Private Session', price: 60, maxParticipants: 1 },
  } as const;

  // Only change type - don't auto-fill price/max on existing sessions (coach may have customized)
  const handleSessionTypeChange = (newType: string) => {
    setSessionTypeState(newType);
    if (newType === 'partner') setMax('2');
    else if (newType === 'private') setMax('1');
    else if (newType === 'small_group') setMax(String(SESSION_PRESETS.small_group.maxParticipants));
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusAreaList, setFocusAreaList] = useState<string[]>([]);
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

  useEffect(() => {
    fetch('/api/focus-areas')
      .then((r) => r.json())
      .then((data) => data.focusAreas && data.focusAreas.length > 0 && setFocusAreaList(data.focusAreas))
      .catch(() => {});
  }, []);

  const focusOptions = focusAreaList.length > 0 ? focusAreaList : [...SESSION_FOCUS_AREAS];
  const optionsWithCurrent = focus && !focusOptions.includes(focus) ? [focus, ...focusOptions] : focusOptions;

  const isGroup =
    sessionTypeState === 'group' || sessionTypeState === 'small_group';

  const selectedFacility = facilities.find((f) => f.id === facilityId);

  const handleLocationCreated = (facility: CoachFacilityOption) => {
    setFacilities((prev) => {
      if (prev.some((f) => f.id === facility.id)) return prev;
      return [...prev, facility].sort((a, b) => a.name.localeCompare(b.name));
    });
    setFacilityId(facility.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    setError(null);
    const maxNum = Math.min(20, Math.max(1, parseInt(max, 10) || 2));
    if (maxNum < currentParticipants) {
      setError(`Max participants cannot be less than ${currentParticipants} already registered`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_type: sessionTypeState,
          focus_area: focus.trim() || null,
          focus_area_2: focus2.trim() || null,
          join_policy: join,
          max_participants: maxNum,
          price_per_participant: Math.max(0, parseFloat(price) || 0),
          scheduledDate: date,
          scheduledTime: time,
          duration_minutes: durationMinutes,
          facility_id: facilityId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update session');
        return;
      }
      router.push(formMode === 'coach' ? '/coach-sessions' : '/admin');
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
      <CardHeader>
        <CardTitle>Session details</CardTitle>
        <CardDescription>
          Update type, date/time (Eastern), duration, location, topic, who can join, max spots, and price for scheduled sessions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editable && (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
              Only scheduled sessions can be edited. This session is completed or cancelled.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          
          {/* Session Type Selector */}
          <div>
            <Label htmlFor="session-type">Session Type</Label>
            <Select value={sessionTypeState} onValueChange={handleSessionTypeChange} disabled={!editable}>
              <SelectTrigger id="session-type">
                <SelectValue placeholder="Select session type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small_group">Small Group</SelectItem>
                <SelectItem value="partner">Partner session</SelectItem>
                <SelectItem value="private">Private (1:1)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Suggested: ${SESSION_PRESETS[sessionTypeState as keyof typeof SESSION_PRESETS]?.price ?? 30}/person - adjust price below as needed
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                disabled={!editable}
              />
            </div>
            <div>
              <Label htmlFor="edit-time">Time (Eastern)</Label>
              <Input
                id="edit-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                disabled={!editable}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-duration">Duration</Label>
            <Select
              value={String(durationMinutes)}
              onValueChange={(v) => setDurationMinutes(Number(v))}
              disabled={!editable}
            >
              <SelectTrigger id="edit-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
                <SelectItem value="90">90 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-facility">Location</Label>
              {editable && (formMode === 'coach' || coachId) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setNewLocationOpen(true)}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  New location
                </Button>
              )}
            </div>
            {facilities.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">
                No saved locations. Add one with New location.
              </p>
            ) : (
              <Select
                value={facilityId || undefined}
                onValueChange={setFacilityId}
                disabled={!editable}
              >
                <SelectTrigger id="edit-facility">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.address ? ` — ${f.address}` : f.school ? ` — ${f.school}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedFacility && (
              <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 px-3 py-2">
                {selectedFacility.address && <p>{selectedFacility.address}</p>}
                {selectedFacility.directions && (
                  <p className="italic">{selectedFacility.directions}</p>
                )}
              </div>
            )}
            {(formMode === 'coach' || coachId) && (
              <CoachNewLocationDialog
                open={newLocationOpen}
                onOpenChange={setNewLocationOpen}
                onCreated={handleLocationCreated}
                coachId={coachId}
              />
            )}
          </div>

          {/* Who Can Join */}
          <div>
            <Label htmlFor="join">Who Can Join</Label>
            <Select
              value={join === 'private' ? 'invite_only' : join}
              onValueChange={(v) => setJoin(v as Props['joinPolicy'])}
              disabled={!editable}
            >
              <SelectTrigger id="join">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Anyone — Open registration</SelectItem>
                <SelectItem value="invite_only">Invite Only — Need invite link to register</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Published Status */}
          <div>
            <Label htmlFor="published">Published</Label>
            <Select
              value={join === 'private' ? 'no' : 'yes'}
              onValueChange={(v) => {
                if (v === 'no') {
                  setJoin('private');
                } else if (join === 'private') {
                  setJoin('public');
                }
              }}
              disabled={!editable}
            >
              <SelectTrigger id="published">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes — Visible in Browse Training</SelectItem>
                <SelectItem value="no">No — Hidden, only you can add wrestlers</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {join === 'private' 
                ? 'Session is hidden from public. Only you can add wrestlers manually.'
                : join === 'invite_only'
                  ? 'Session shows in Browse Training but only people with the invite link can register.'
                  : 'Session shows in Browse Training and anyone can book a spot.'
              }
            </p>
          </div>

          {isGroup && (
            <>
              <div>
                <Label htmlFor="focus">Topic / focus (1)</Label>
                <Select value={focus || 'none'} onValueChange={(v) => setFocus(v === 'none' ? '' : v)} disabled={!editable}>
                  <SelectTrigger id="focus">
                    <SelectValue placeholder="e.g. Takedowns, Escapes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {optionsWithCurrent.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="focus2">Topic / focus (2) — optional</Label>
                <Select value={focus2 || 'none'} onValueChange={(v) => setFocus2(v === 'none' ? '' : v)} disabled={!editable}>
                  <SelectTrigger id="focus2">
                    <SelectValue placeholder="Second topic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(focus2 && !focusOptions.includes(focus2)
                      ? [focus2, ...focusOptions]
                      : focusOptions
                    )
                      .filter((a) => a !== focus)
                      .map((area) => (
                        <SelectItem key={area} value={area}>
                          {area}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Shown on session cards as &quot;Covering: …&quot;
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max">Max participants</Label>
                  <Input
                    id="max"
                    type="number"
                    min={Math.max(2, currentParticipants)}
                    max={20}
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    disabled={!editable}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Currently {currentParticipants} registered
                  </p>
                </div>
                <div>
                  <Label htmlFor="price">Price per participant ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={!editable}
                  />
                </div>
              </div>
            </>
          )}
          {!isGroup && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max-other">Max participants</Label>
                <Input
                  id="max-other"
                  type="number"
                  min={
                    sessionTypeState === 'private'
                      ? Math.max(1, currentParticipants)
                      : Math.max(2, currentParticipants)
                  }
                  max={
                    sessionTypeState === 'partner'
                      ? 2
                      : sessionTypeState === 'private'
                        ? 1
                        : 20
                  }
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  disabled={!editable}
                />
              </div>
              <div>
                <Label htmlFor="price-other">Price per participant ($)</Label>
                <Input
                  id="price-other"
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!editable}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={loading || !editable}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
            {sessionStatus === 'scheduled' && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={formMode === 'coach' && currentParticipants > 0}
                title={
                  formMode === 'coach' && currentParticipants > 0
                    ? 'Cancel from My sessions to refund families when someone is registered'
                    : undefined
                }
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete session
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>

    {/* Financials Section */}
    {formMode === 'admin' && (
    <Card>
      <CardHeader>
        <CardTitle>Session Financials</CardTitle>
        <CardDescription>
          What parents paid (gross) and what you paid/will pay the coach. Suggested payout is{' '}
          <span className="font-medium">80%</span> of gross unless you override below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Parents Paid (Gross)</Label>
            <p className="text-xl font-semibold mt-1">${participantAmountPaidSum.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">From Stripe checkout</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Suggested Coach Payout</Label>
            <p className="text-xl font-semibold mt-1 text-blue-400">
              ${(participantAmountPaidSum * coachShareRate).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{coachSharePctLabel} of gross</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Guild Net</Label>
            <p className={`text-xl font-semibold mt-1 ${(participantAmountPaidSum - (athletePayment ?? 0)) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              ${(participantAmountPaidSum - (athletePayment ?? 0)).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Gross - Coach Payout</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Recorded Payout</Label>
            <p className="text-xl font-semibold mt-1">
              {athletePayment != null ? `$${Number(athletePayment).toFixed(2)}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {athletePayoutDate ? `Paid ${formatEST(`${athletePayoutDate}T12:00:00`, 'MMM d, yyyy')}` : 'Not yet paid'}
            </p>
          </div>
        </div>
        {participantAmountPaidSum === 0 && currentParticipants > 0 && (
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm">
            <p className="font-medium text-amber-500">Gross revenue is $0</p>
            <p className="text-muted-foreground text-xs mt-1">
              This could be a promo session or the payments weren&apos;t recorded via Stripe. 
              If parents paid cash, use the form below to add a manual payment record.
            </p>
          </div>
        )}

        {/* Manual Payment Entry */}
        <div className="pt-4 border-t border-border">
          <Label className="text-sm font-medium">Add Manual Payment (Cash/Check)</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Record cash, check, or Venmo after the session is marked complete — or anytime parents paid outside Stripe.
            This adds to gross revenue for this session.
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
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
                    notes: `Manual ${manualPaymentMethod} payment`
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-amount" className="text-xs">Amount ($)</Label>
              <Input
                id="manual-amount"
                type="number"
                min={0}
                step={1}
                value={manualPaymentAmount}
                onChange={(e) => setManualPaymentAmount(e.target.value)}
                className="w-24"
                placeholder="30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-method" className="text-xs">Method</Label>
              <Select value={manualPaymentMethod} onValueChange={(v) => setManualPaymentMethod(v as typeof manualPaymentMethod)}>
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
            <Button type="submit" variant="outline" disabled={manualPaymentLoading || manualPaymentAmount.trim() === ''}>
              {manualPaymentLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Add Payment'
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
    )}

    {sessionStatus === 'scheduled' && (
      <Card>
        <CardHeader>
          <CardTitle>{formMode === 'coach' ? 'Mark session complete' : '1 · Mark session complete'}</CardTitle>
          <CardDescription>
            {formMode === 'coach' ? (
              <>When the session is over, mark it complete so it counts in your stats and reviews.</>
            ) : (
              <>Do this first: record that this session happened. Status becomes completed so it counts in coach stats and unlocks payout below.</>
            )}
          </CardDescription>
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
    )}

    {formMode === 'admin' && (
    <Card className={sessionStatus !== 'completed' ? 'opacity-90' : undefined}>
      <CardHeader>
        <CardTitle>2 · Record coach payout</CardTitle>
        <CardDescription>
          {athletePayoutDate ? (
            <>This session is already marked paid.</>
          ) : sessionStatus !== 'completed' ? (
            <>After the session is marked complete (step 1), enter what you paid the coach and record it here. Use a custom amount when parents didn&apos;t pay but you still pay the coach (e.g. flat $50).</>
          ) : (
            <>
              Sets <span className="font-medium">athlete payment</span> and today&apos;s payout date for this session. Suggested amount uses what parents paid (per wrestler) when available — that reflects family discounts. Adjust if you already paid a different number.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {athletePayoutDate ? (
          <p className="text-sm text-muted-foreground">
            Payout recorded on{' '}
            <span className="font-medium text-foreground">
              {formatEST(`${athletePayoutDate}T12:00:00`, 'MMM d, yyyy')}
            </span>
            {athletePayment != null && Number(athletePayment) > 0 && (
              <> · ${Number(athletePayment).toFixed(2)}</>
            )}
          </p>
        ) : sessionStatus !== 'completed' ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
            Complete step 1 first — payout can only be recorded for completed sessions.
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="payout-amount" className="whitespace-nowrap">
                Coach payout ($)
              </Label>
              <Input
                id="payout-amount"
                type="number"
                min={0}
                step={0.01}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="w-28"
                placeholder="50"
              />
              <p className="text-xs text-muted-foreground max-w-sm">
                Suggested from recorded payout or roster (price × {currentParticipants} × coach share) — edit for cash, comps, or off-app payments.
              </p>
            </div>
            <Button type="submit" disabled={payoutLoading || payoutAmount.trim() === ''}>
              {payoutLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Recording…
                </>
              ) : (
                'Record payout'
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
    )}

    <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete session?</DialogTitle>
          <DialogDescription>
            {formMode === 'coach' && currentParticipants > 0
              ? 'Sessions with registrations cannot be deleted here — cancel from your session list to credit families.'
              : 'This will permanently delete this session and all participants. This cannot be undone.'}
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
                router.push(formMode === 'coach' ? '/coach-sessions' : '/admin');
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
            {deleteLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
