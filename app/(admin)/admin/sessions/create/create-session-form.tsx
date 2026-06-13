'use client';

import { useState } from 'react';
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
import { Copy, Check, Plus, X } from 'lucide-react';
import { formatEST } from '@/lib/format-date';

type Athlete = { id: string; name: string; school: string };
type Facility = { id: string; name: string; school: string; address?: string | null };

// Session type presets
const SESSION_PRESETS = {
  small_group: { label: 'Small Group', price: 30, maxParticipants: 6, duration: 60 },
  partner: { label: 'Partner Session', price: 50, maxParticipants: 2, duration: 60 },
  private: { label: 'Private Session', price: 60, maxParticipants: 1, duration: 60 },
} as const;

type SessionTypeKey = keyof typeof SESSION_PRESETS;

type DateTimeEntry = { date: string; time: string };

export function CreateSessionForm({
  athletes,
  facilities,
}: {
  athletes: Athlete[];
  facilities: Facility[];
}) {
  const [sessionType, setSessionType] = useState<SessionTypeKey>('small_group');
  const [joinPolicy, setJoinPolicy] = useState<'public' | 'invite_only' | 'private'>('public');
  const [athleteId, setAthleteId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  // Support multiple dates
  const [dateTimes, setDateTimes] = useState<DateTimeEntry[]>([{ date: '', time: '' }]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState(6);
  const [pricePerParticipant, setPricePerParticipant] = useState(30);

  // Auto-fill fields when session type changes
  const handleSessionTypeChange = (type: SessionTypeKey) => {
    setSessionType(type);
    const preset = SESSION_PRESETS[type];
    setPricePerParticipant(preset.price);
    setMaxParticipants(preset.maxParticipants);
    setDurationMinutes(preset.duration);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{
    shareUrl: string;
    partnerInviteCode: string;
    scheduledDatetime: string;
    maxParticipants: number;
    pricePerParticipant: number;
  }>>([]);
  const [copied, setCopied] = useState(false);

  // Add a new date/time entry
  const addDateTime = () => {
    // Copy time from first entry if available
    const lastTime = dateTimes[dateTimes.length - 1]?.time || '';
    setDateTimes([...dateTimes, { date: '', time: lastTime }]);
  };

  // Remove a date/time entry
  const removeDateTime = (index: number) => {
    if (dateTimes.length > 1) {
      setDateTimes(dateTimes.filter((_, i) => i !== index));
    }
  };

  // Update a specific date/time entry
  const updateDateTime = (index: number, field: 'date' | 'time', value: string) => {
    const updated = [...dateTimes];
    updated[index] = { ...updated[index], [field]: value };
    setDateTimes(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults([]);
    
    // Validate all date/times are filled
    const validDateTimes = dateTimes.filter(dt => dt.date && dt.time);
    if (!athleteId || !facilityId || validDateTimes.length === 0) {
      setError('Please select coach, facility, and at least one date/time.');
      return;
    }
    
    setLoading(true);
    const createdSessions: typeof results = [];
    
    try {
      // Create a session for each date/time
      for (const dt of validDateTimes) {
        const res = await fetch('/api/admin/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId: athleteId.trim(),
            facilityId: facilityId.trim(),
            scheduledDate: dt.date,
            scheduledTime: dt.time,
            durationMinutes,
            maxParticipants,
            pricePerParticipant,
            sessionType,
            joinPolicy,
            published: joinPolicy !== 'private',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Failed to create session for ${dt.date}`);
          continue;
        }
        createdSessions.push({
          shareUrl: data.shareUrl,
          partnerInviteCode: data.partnerInviteCode,
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
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Session details</CardTitle>
        <CardDescription>
          Choose coach and facility, set date/time and capacity. You’ll get a shareable link to send to families.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-4 py-2 text-sm">
            {error}
          </div>
        )}

{results.length > 0 ? (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="font-medium text-foreground">
              {results.length} session{results.length > 1 ? 's' : ''} created
            </p>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {results.map((result, idx) => (
                <div key={idx} className="border-b border-border/50 pb-3 last:border-0">
                  <p className="text-sm text-muted-foreground mb-2">
                    {formatEST(new Date(result.scheduledDatetime), 'EEEE, MMM d, yyyy h:mm a')}
                    {' · '}
                    Up to {result.maxParticipants} participants · ${Number(result.pricePerParticipant).toFixed(2)}/person
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={result.shareUrl}
                      className="font-mono text-xs h-8"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        navigator.clipboard.writeText(result.shareUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }} 
                      className="gap-1 h-8"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Share these links with parents. They can open it, sign in, choose their wrestler, and join.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="default" size="sm">
                <Link href="/admin?tab=sessions">View in Admin → Sessions</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setResults([]);
                setDateTimes([{ date: '', time: '' }]);
              }}>
                Create more sessions
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Session Type Selector - First */}
            <div>
              <Label htmlFor="sessionType">Session Type</Label>
              <Select value={sessionType} onValueChange={(v) => handleSessionTypeChange(v as SessionTypeKey)}>
                <SelectTrigger id="sessionType">
                  <SelectValue placeholder="Select session type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small_group">Small Group</SelectItem>
                  <SelectItem value="partner">Partner session</SelectItem>
                  <SelectItem value="private">Private (1:1)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-fills suggested price (${SESSION_PRESETS[sessionType].price}) - you can change it below
              </p>
            </div>

            {/* Who Can Join */}
            <div>
              <Label htmlFor="joinPolicy">Who Can Join</Label>
              <Select value={joinPolicy === 'private' ? 'invite_only' : joinPolicy} onValueChange={(v) => setJoinPolicy(v as typeof joinPolicy)}>
                <SelectTrigger id="joinPolicy">
                  <SelectValue placeholder="Select who can join" />
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
              <Select value={joinPolicy === 'private' ? 'no' : 'yes'} onValueChange={(v) => {
                if (v === 'no') {
                  setJoinPolicy('private');
                } else {
                  if (joinPolicy === 'private') setJoinPolicy('public');
                }
              }}>
                <SelectTrigger id="published">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes — Visible in Browse Training</SelectItem>
                  <SelectItem value="no">No — Hidden, only you can add wrestlers</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {joinPolicy === 'private' 
                  ? 'Session hidden from public. Only you can add wrestlers.'
                  : joinPolicy === 'invite_only'
                    ? 'Session shows but only people with the invite link can register.'
                    : 'Session shows in Browse Training and anyone can book.'
                }
              </p>
            </div>

            <div>
              <Label htmlFor="coach">Coach</Label>
              <Select value={athleteId} onValueChange={setAthleteId} required>
                <SelectTrigger id="coach">
                  <SelectValue placeholder="Select coach" />
                </SelectTrigger>
                <SelectContent>
                  {athletes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.school ? ` — ${a.school}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
                <Label htmlFor="facility">Facility</Label>
                <Select value={facilityId} onValueChange={setFacilityId} required>
                <SelectTrigger id="facility">
                  <SelectValue placeholder="Select facility" />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.school ? ` — ${f.school}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Multi-date support */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Date(s) & Time</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={addDateTime}
                  className="gap-1 h-7 text-xs"
                >
                  <Plus className="h-3 w-3" /> Add date
                </Button>
              </div>
              {dateTimes.map((dt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dt.date}
                    onChange={(e) => updateDateTime(idx, 'date', e.target.value)}
                    min={today}
                    className="flex-1"
                    required={idx === 0}
                  />
                  <Input
                    type="time"
                    value={dt.time}
                    onChange={(e) => updateDateTime(idx, 'time', e.target.value)}
                    className="w-32"
                    required={idx === 0}
                  />
                  {dateTimes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDateTime(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {dateTimes.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Creating {dateTimes.filter(dt => dt.date && dt.time).length} sessions with the same settings
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="duration">Duration (min)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={30}
                  max={120}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                />
              </div>
              <div>
                <Label htmlFor="max">Max participants</Label>
                <Input
                  id="max"
                  type="number"
                  min={sessionType === 'private' ? 1 : 2}
                  max={
                    sessionType === 'partner' ? 2 : sessionType === 'private' ? 1 : 20
                  }
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value) || 6)}
                />
              </div>
              <div>
                <Label htmlFor="price">Price per person ($)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={pricePerParticipant}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setPricePerParticipant(0);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setPricePerParticipant(Math.max(0, n));
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <span className="font-medium">$0</span> for launch / comp sessions (parents complete registration with no card charge).
                </p>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading 
                ? 'Creating…' 
                : dateTimes.filter(dt => dt.date && dt.time).length > 1 
                  ? `Create ${dateTimes.filter(dt => dt.date && dt.time).length} sessions`
                  : 'Create session & get link'
              }
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
