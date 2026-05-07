'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { startOfDay } from 'date-fns';
import { formatEST } from '@/lib/format-date';
import { COACH_AVAILABILITY_BLOCKS_CHANGED_EVENT, formatSlotDisplay } from '@/lib/availability';

const SLOTS_24H = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
];

type Slot = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  facility_id?: string | null;
};

function slotAlreadyInList(
  list: Slot[],
  slotDate: string,
  start: string,
  end: string,
  facilityKey: string | null
): boolean {
  return list.some((s) => {
    const sf = (s.facility_id ?? null) as string | null;
    return (
      s.slot_date === slotDate && s.start_time === start && s.end_time === end && sf === facilityKey
    );
  });
}

export function AvailabilityManager() {
  const [list, setList] = useState<Slot[]>([]);
  const [blockedYmd, setBlockedYmd] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [start, setStart] = useState<string>('09:00');
  const [end, setEnd] = useState<string>('17:00');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [coachFacilityOptions, setCoachFacilityOptions] = useState<
    { id: string; name: string; address?: string | null; school?: string }[]
  >([]);
  /** `'__any__'` = parents may book at any linked site for this opening */
  const [facilityForAdd, setFacilityForAdd] = useState<string>('__any__');

  const refreshSlots = useCallback(async () => {
    const r = await fetch('/api/availability/me');
    const data = await r.json();
    if (r.ok) {
      if (Array.isArray(data.availability)) setList(data.availability);
      if (Array.isArray(data.coachFacilities)) setCoachFacilityOptions(data.coachFacilities);
    }
  }, []);

  const refreshBlockedDates = useCallback(async () => {
    const r = await fetch('/api/coach/availability/blocks');
    const data = await r.json();
    if (r.ok && Array.isArray(data.blocks)) {
      setBlockedYmd(
        new Set(
          (data.blocks as { blocked_date?: string }[])
            .map((b) => b.blocked_date)
            .filter((d): d is string => typeof d === 'string' && d.length >= 10)
        )
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([refreshSlots(), refreshBlockedDates()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSlots, refreshBlockedDates]);

  useEffect(() => {
    const onBlocksChanged = () => {
      void refreshBlockedDates();
    };
    window.addEventListener(COACH_AVAILABILITY_BLOCKS_CHANGED_EVENT, onBlocksChanged);
    return () => window.removeEventListener(COACH_AVAILABILITY_BLOCKS_CHANGED_EVENT, onBlocksChanged);
  }, [refreshBlockedDates]);

  const slotYmdSet = useMemo(() => new Set(list.map((s) => s.slot_date)), [list]);

  const calendarModifiers = useMemo(
    () => ({
      hasOpening: (d: Date) => {
        const ymd = formatEST(d, 'yyyy-MM-dd');
        return slotYmdSet.has(ymd) && !blockedYmd.has(ymd);
      },
      dayBlocked: (d: Date) => blockedYmd.has(formatEST(d, 'yyyy-MM-dd')),
    }),
    [slotYmdSet, blockedYmd]
  );

  const calendarModifierClassNames = useMemo(
    () => ({
      hasOpening:
        "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-[3px] after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-emerald-500 after:content-['']",
      dayBlocked:
        "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-[3px] after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-red-500 after:content-['']",
    }),
    []
  );

  const facilityNameLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of coachFacilityOptions) m.set(f.id, f.name);
    return m;
  }, [coachFacilityOptions]);

  const handleAdd = async () => {
    if (selectedDates.length === 0) {
      window.alert('Please select one or more dates.');
      return;
    }
    const startM = parseInt(start.split(':')[0], 10) * 60 + parseInt(start.split(':')[1] || '0', 10);
    const endM = parseInt(end.split(':')[0], 10) * 60 + parseInt(end.split(':')[1] || '0', 10);
    if (endM <= startM) {
      window.alert('End time must be after start time.');
      return;
    }
    const facilityKey = facilityForAdd === '__any__' ? null : facilityForAdd;
    if (facilityKey && !coachFacilityOptions.some((f) => f.id === facilityKey)) {
      window.alert('Pick a valid wrestling room, or Any linked room.');
      return;
    }

    setAdding(true);
    try {
      const toAdd = selectedDates.filter(
        (d) => !slotAlreadyInList(list, formatEST(d, 'yyyy-MM-dd'), start, end, facilityKey)
      );
      const skippedExact = selectedDates.length - toAdd.length;
      if (toAdd.length === 0) {
        window.alert(
          skippedExact > 0
            ? `You already have this opening (${formatSlotDisplay(start)}–${formatSlotDisplay(end)}) on every date you selected. It’s listed under Upcoming openings — remove a slot there if you want to change it, or pick different dates or times.`
            : 'Nothing to add.'
        );
        return;
      }

      let firstError: string | null = null;
      let succeeded = 0;
      let serverDuplicate = 0;
      for (const d of toAdd) {
        const slotDate = formatEST(d, 'yyyy-MM-dd');
        const r = await fetch('/api/availability/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot_date: slotDate,
            start_time: start,
            end_time: end,
            ...(facilityKey ? { facilityId: facilityKey } : {}),
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          if (!firstError) firstError = (data.error as string) || 'Failed to add';
        } else {
          succeeded++;
          if (data.duplicate) serverDuplicate++;
        }
      }
      await refreshSlots();
      if (firstError) {
        window.alert(
          succeeded > 0
            ? `Saved ${succeeded} slot(s). Some dates failed: ${firstError}`
            : firstError
        );
      } else {
        const newOrUpdated = succeeded - serverDuplicate;
        const infoParts: string[] = [];
        if (newOrUpdated > 0) infoParts.push(`Added ${newOrUpdated} opening${newOrUpdated === 1 ? '' : 's'}`);
        if (serverDuplicate > 0) {
          infoParts.push(
            `${serverDuplicate} already had this time (left as-is)`
          );
        }
        if (skippedExact > 0) {
          infoParts.push(`${skippedExact} not sent — already on your list`);
        }
        if (infoParts.length > 1 || serverDuplicate > 0 || skippedExact > 0) {
          window.alert(infoParts.join('. ') + '.');
        }
        setSelectedDates([]);
        setStart('09:00');
        setEnd('17:00');
        setFacilityForAdd('__any__');
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to add slot');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const r = await fetch(`/api/availability/me?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || 'Failed to delete');
      }
      await refreshSlots();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your calendar</CardTitle>
          <CardDescription>
            Select dates and hours parents can request you. Optionally pick a wrestling room — if you train at multiple
            sites, parents booking that opening will only see that location on the booking page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Dates</label>
            <div className="flex justify-center">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates ?? [])}
                disabled={(date) => date < startOfDay(new Date())}
                modifiers={calendarModifiers}
                modifiersClassNames={calendarModifierClassNames}
                className="rounded-md border"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                Opening that day
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-5 shrink-0 rounded-full bg-red-500" aria-hidden />
                Blocked day
              </span>
            </p>
            {selectedDates.length > 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-2">
                {selectedDates.length} day{selectedDates.length === 1 ? '' : 's'} selected
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-28">
              <label className="text-sm font-medium mb-1 block">Start</label>
              <Select value={start} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOTS_24H.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatSlotDisplay(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="text-sm font-medium mb-1 block">End</label>
              <Select value={end} onValueChange={setEnd}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOTS_24H.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatSlotDisplay(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full max-w-sm space-y-1">
              <label className="text-sm font-medium block">Where you&apos;ll be</label>
              <Select value={facilityForAdd} onValueChange={setFacilityForAdd}>
                <SelectTrigger>
                  <SelectValue placeholder="Facility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any linked wrestling room</SelectItem>
                  {coachFacilityOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {coachFacilityOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Have your admin attach sites to your profile (primary / secondary locations) so you can tag a room here.
                </p>
              ) : null}
            </div>
            <Button onClick={() => void handleAdd()} disabled={adding || selectedDates.length === 0}>
              {adding ? 'Adding…' : selectedDates.length > 1 ? `Add opening (${selectedDates.length} days)` : 'Add opening'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming openings</CardTitle>
          <CardDescription>
            {list.length === 0
              ? 'No slots yet — add your hours with the calendar above.'
              : 'These are the times parents can book against.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No upcoming slots yet.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/30 gap-2"
                >
                  <span className="flex flex-col min-w-0 gap-0.5">
                    <span className="font-medium text-sm sm:text-base">
                      {formatEST(new Date(s.slot_date + 'T12:00:00'), 'EEE, MMM d, yyyy')} ·{' '}
                      {formatSlotDisplay(s.start_time)} – {formatSlotDisplay(s.end_time)}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {s.facility_id
                        ? facilityNameLookup.get(s.facility_id) ?? 'Wrestling room'
                        : 'Any linked wrestling room'}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 min-h-[44px]"
                    onClick={() => void handleDelete(s.id)}
                    disabled={deleting === s.id}
                  >
                    {deleting === s.id ? 'Removing…' : 'Remove'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
