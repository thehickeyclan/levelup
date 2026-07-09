'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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
import { Check, Plus, X, Share2, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import type { CoachCreateSessionType } from '@/lib/coach-session-pricing';
import { COACH_SESSION_FALLBACK_USD } from '@/lib/coach-session-pricing';
import {
  CoachNewLocationDialog,
  type CoachLocationOption,
} from '@/components/coach-new-location-dialog';
import { SessionShareGraphicPanel } from '@/components/coach/session-share-graphic-panel';
import type { ShareGraphicThemeId } from '@/lib/session-share-graphic/themes';

type Facility = CoachLocationOption;

/** Format only — price comes from recommendedPrices (rate card) with coach override in the price field */
const SESSION_FORMAT = {
  small_group: { label: 'Small group', maxParticipants: 6, duration: 60 },
  partner: { label: 'Partner (2 athletes)', maxParticipants: 2, duration: 60 },
  private: { label: 'Private (1-on-1)', maxParticipants: 1, duration: 60 },
} as const;

type SessionTypeKey = CoachCreateSessionType;
type DateTimeEntry = { date: string; time: string };

type InitialPrefill = {
  type?: SessionTypeKey;
  date?: string;
  time?: string;
};

export function CoachCreateSessionForm({
  coachId,
  coachName,
  facilities: initialFacilities,
  defaultFacilityId = '',
  recommendedPrices,
  defaultShareTheme,
  initialPrefill,
}: {
  coachId: string;
  coachName: string;
  facilities: Facility[];
  /** Coach profile primary facility — pre-selected when in list */
  defaultFacilityId?: string;
  recommendedPrices: Record<SessionTypeKey, number>;
  defaultShareTheme: ShareGraphicThemeId;
  initialPrefill?: InitialPrefill;
}) {
  const startingType: SessionTypeKey = initialPrefill?.type ?? 'small_group';
  const startingPreset = SESSION_FORMAT[startingType];

  const [facilities, setFacilities] = useState<Facility[]>(initialFacilities);
  const [facilitiesLoading, setFacilitiesLoading] = useState(initialFacilities.length === 0);
  const [newLocationOpen, setNewLocationOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionTypeKey>(startingType);
  const [joinPolicy, setJoinPolicy] = useState<'public' | 'invite_only'>('public');
  const [facilityId, setFacilityId] = useState(() => {
    if (defaultFacilityId && initialFacilities.some((f) => f.id === defaultFacilityId)) {
      return defaultFacilityId;
    }
    return initialFacilities[0]?.id || '';
  });
  const [facilitySearch, setFacilitySearch] = useState('');
  const [dateTimes, setDateTimes] = useState<DateTimeEntry[]>([
    { date: initialPrefill?.date ?? '', time: initialPrefill?.time ?? '' },
  ]);
  const [durationMinutes, setDurationMinutes] = useState<number>(startingPreset.duration);
  const [maxParticipants, setMaxParticipants] = useState<number>(startingPreset.maxParticipants);
  const [pricePerParticipant, setPricePerParticipant] = useState(
    () => recommendedPrices[startingType] ?? COACH_SESSION_FALLBACK_USD[startingType]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{
    sessionId: string;
    shareUrl: string;
    scheduledDatetime: string;
    maxParticipants: number;
    pricePerParticipant: number;
  }>>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coaches/locations?coachId=${encodeURIComponent(coachId)}`)
      .then((r) => r.json())
      .then((data: { facilities?: Facility[] }) => {
        if (cancelled) return;
        const list = (data.facilities ?? []).map((f) => ({ ...f, school: f.school ?? '' }));
        if (list.length === 0) return;
        setFacilities(list);
        setFacilityId((prev) => {
          if (prev && list.some((f) => f.id === prev)) return prev;
          if (defaultFacilityId && list.some((f) => f.id === defaultFacilityId)) {
            return defaultFacilityId;
          }
          return list[0]?.id ?? '';
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFacilitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, defaultFacilityId]);

  const selectedFacility = facilities.find((f) => f.id === facilityId);

  const filteredFacilities = useMemo(() => {
    const q = facilitySearch.trim().toLowerCase();
    if (!q) return facilities;
    return facilities.filter((f) => {
      const hay = [f.name, f.school, f.address].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [facilities, facilitySearch]);

  const handleLocationCreated = (facility: Facility) => {
    setFacilities((prev) => {
      if (prev.some((f) => f.id === facility.id)) {
        return prev.map((f) => (f.id === facility.id ? facility : f));
      }
      return [...prev, facility].sort((a, b) => a.name.localeCompare(b.name));
    });
    setFacilityId(facility.id);
  };

  const handleSessionTypeChange = (type: SessionTypeKey) => {
    setSessionType(type);
    const preset = SESSION_FORMAT[type];
    setPricePerParticipant(recommendedPrices[type] ?? COACH_SESSION_FALLBACK_USD[type]);
    setMaxParticipants(preset.maxParticipants);
    setDurationMinutes(preset.duration);
  };

  const addDateTime = () => {
    const lastTime = dateTimes[dateTimes.length - 1]?.time || '';
    setDateTimes([...dateTimes, { date: '', time: lastTime }]);
  };

  const removeDateTime = (index: number) => {
    if (dateTimes.length > 1) {
      setDateTimes(dateTimes.filter((_, i) => i !== index));
    }
  };

  const updateDateTime = (index: number, field: 'date' | 'time', value: string) => {
    const updated = [...dateTimes];
    updated[index] = { ...updated[index], [field]: value };
    setDateTimes(updated);
  };

  const handleCopyLink = async (url: string, idx: number) => {
    await navigator.clipboard.writeText(url);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults([]);
    
    const validDateTimes = dateTimes.filter(dt => dt.date && dt.time);
    if (!facilityId || validDateTimes.length === 0) {
      setError(
        facilities.length === 0
          ? 'Add a location, then pick at least one date/time.'
          : 'Please select a location and at least one date/time.'
      );
      return;
    }
    
    setLoading(true);
    const createdSessions: typeof results = [];
    
    try {
      for (const dt of validDateTimes) {
        const res = await fetch('/api/admin/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId: coachId,
            facilityId,
            scheduledDate: dt.date,
            scheduledTime: dt.time,
            durationMinutes,
            maxParticipants,
            pricePerParticipant,
            sessionType,
            joinPolicy,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Failed to create session for ${dt.date}`);
          continue;
        }
        createdSessions.push({
          sessionId: data.sessionId as string,
          shareUrl: data.shareUrl,
          scheduledDatetime: data.scheduledDatetime,
          maxParticipants: data.maxParticipants,
          pricePerParticipant: data.pricePerParticipant,
        });
      }
      
      if (createdSessions.length > 0) {
        setResults(createdSessions);
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">New session</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{coachName}</span>
          {' — '}type, place, time, then share the link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {results.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-500" />
                {results.length} session{results.length > 1 ? 's' : ''} created
              </p>
            </div>
            
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {formatEST(new Date(result.scheduledDatetime), 'EEEE, MMM d · h:mm a')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Up to {result.maxParticipants} athletes · ${Number(result.pricePerParticipant).toFixed(0)}/person
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={result.shareUrl}
                      className="font-mono text-xs h-9 flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-9 gap-1.5 shrink-0"
                      onClick={() => handleCopyLink(result.shareUrl, idx)}
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4" />
                          Copy link
                        </>
                      )}
                    </Button>
                  </div>
                  {result.sessionId ? (
                    <SessionShareGraphicPanel
                      sessionId={result.sessionId}
                      defaultTheme={defaultShareTheme}
                      shareCaption={`Join my session — ${formatEST(new Date(result.scheduledDatetime), 'EEE, MMM d · h:mm a')}. ${result.shareUrl}`}
                      className="rounded-lg border border-border bg-muted/20 p-3 space-y-3"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Share these links with parents via text or social. They can sign up directly.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="default" size="sm">
                <Link href="/coach-sessions">View My Sessions</Link>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setResults([]);
                  setDateTimes([{ date: '', time: '' }]);
                }}
              >
                Create More
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Session type</Label>
              <Select value={sessionType} onValueChange={(v) => handleSessionTypeChange(v as SessionTypeKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small_group">{SESSION_FORMAT.small_group.label}</SelectItem>
                  <SelectItem value="partner">{SESSION_FORMAT.partner.label}</SelectItem>
                  <SelectItem value="private">{SESSION_FORMAT.private.label}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="create-facility">Location</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-accent hover:text-accent"
                  onClick={() => setNewLocationOpen(true)}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  Add location
                </Button>
              </div>
              {facilitiesLoading && facilities.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">
                  Loading your locations…
                </p>
              ) : facilities.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">
                  No saved locations yet. Tap Add location to add where this session will be held.
                </p>
              ) : (
                <>
                  {facilities.length > 4 ? (
                    <Input
                      id="create-facility-search"
                      type="search"
                      placeholder="Search locations…"
                      value={facilitySearch}
                      onChange={(e) => setFacilitySearch(e.target.value)}
                      className="min-h-[44px]"
                      autoComplete="off"
                    />
                  ) : null}
                  <Select value={facilityId || undefined} onValueChange={setFacilityId} required>
                    <SelectTrigger id="create-facility" className="min-h-[44px]">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredFacilities.length === 0 ? (
                        <SelectItem value="__no_match__" disabled>
                          No matches
                        </SelectItem>
                      ) : (
                        filteredFacilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                            {f.address ? ` — ${f.address}` : f.school ? ` — ${f.school}` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </>
              )}
              {selectedFacility && (
                <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 px-3 py-2">
                  {selectedFacility.address && <p>{selectedFacility.address}</p>}
                  {selectedFacility.directions && (
                    <p className="italic">{selectedFacility.directions}</p>
                  )}
                </div>
              )}
              <CoachNewLocationDialog
                open={newLocationOpen}
                onOpenChange={setNewLocationOpen}
                onCreated={handleLocationCreated}
                coachId={coachId}
              />
            </div>

            <div>
              <Label>Who can sign up</Label>
              <Select value={joinPolicy} onValueChange={(v) => setJoinPolicy(v as 'public' | 'invite_only')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — anyone with the link can join</SelectItem>
                  <SelectItem value="invite_only">Invite only — private invite code</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Public is the default: share your link and families can register. Choose invite only when you want a private code.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>When</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addDateTime} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Add another time
                </Button>
              </div>
              {dateTimes.map((dt, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="date"
                    value={dt.date}
                    onChange={(e) => updateDateTime(idx, 'date', e.target.value)}
                    min={today}
                    className="min-w-0 flex-1 sm:max-w-[11rem]"
                    required={idx === 0}
                  />
                  <Input
                    type="time"
                    value={dt.time}
                    onChange={(e) => updateDateTime(idx, 'time', e.target.value)}
                    className="w-[7.5rem]"
                    required={idx === 0}
                  />
                  {dateTimes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDateTime(idx)}
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="coach-session-price">
                {sessionType === 'private' ? 'Price ($)' : 'Price per spot ($)'}
              </Label>
              <Input
                id="coach-session-price"
                type="number"
                min={0}
                step={1}
                value={pricePerParticipant}
                onChange={(e) => setPricePerParticipant(Number(e.target.value) || 0)}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Suggested from your rate card: ${recommendedPrices[sessionType]?.toFixed(0) ?? '—'} — change if you need to.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg"
              >
                <span>More options</span>
                {moreOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
              {moreOpen && (
                <div className="space-y-4 px-3 pb-3 pt-0 border-t border-border/80">
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <div>
                      <Label>Duration</Label>
                      <Select value={String(durationMinutes)} onValueChange={(v) => setDurationMinutes(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="45">45 min</SelectItem>
                          <SelectItem value="60">60 min</SelectItem>
                          <SelectItem value="90">90 min</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Max athletes</Label>
                      <Input
                        type="number"
                        min={sessionType === 'private' ? 1 : 2}
                        max={sessionType === 'partner' ? 2 : sessionType === 'private' ? 1 : 12}
                        value={maxParticipants}
                        onChange={(e) => setMaxParticipants(Number(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-medium">
              {loading 
                ? 'Creating…' 
                : dateTimes.filter(dt => dt.date && dt.time).length > 1 
                  ? `Create ${dateTimes.filter(dt => dt.date && dt.time).length} Sessions`
                  : 'Create Session'
              }
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
