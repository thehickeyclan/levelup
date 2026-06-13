'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProfileImage } from '@/components/profile-image';
import { CoachSessionBadge } from '@/components/coach-session-badge';
import { formatEST } from '@/lib/format-date';
import { Loader2, Mail, Phone, MessageCircle } from 'lucide-react';
import type { CoachWrestlerProfile } from '@/lib/coach-wrestler-profile';
import { cn } from '@/lib/utils';

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return phone;
}

function phoneTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  return `tel:${digits}`;
}

function phoneSmsHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return `sms:${ten}`;
}

function ContactBlock({
  title,
  name,
  phone,
  email,
}: {
  title: string;
  name?: string;
  phone: string | null;
  email?: string | null;
}) {
  if (!phone && !email) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">No contact on file</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {name ? <p className="text-sm font-medium text-foreground">{name}</p> : null}
      {phone ? (
        <p className="font-mono text-sm text-foreground">{formatPhoneDisplay(phone)}</p>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {email}
        </a>
      ) : null}
      {phone ? (
        <div className="flex gap-2 pt-1">
          <a
            href={phoneTelHref(phone)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-md',
              'bg-accent text-black text-sm font-semibold hover:bg-accent-hover touch-manipulation'
            )}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Call
          </a>
          <a
            href={phoneSmsHref(phone)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-md',
              'border border-accent/50 text-accent text-sm font-semibold hover:bg-accent/10 touch-manipulation'
            )}
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
            Text
          </a>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  wrestlerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CoachWrestlerProfileDialog({ wrestlerId, open, onOpenChange }: Props) {
  const [profile, setProfile] = useState<CoachWrestlerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !wrestlerId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);

    fetch(`/api/coach/wrestlers/${encodeURIComponent(wrestlerId)}/profile`)
      .then((r) => r.json())
      .then((data: { profile?: CoachWrestlerProfile; error?: string }) => {
        if (cancelled) return;
        if (!data.profile) {
          setError(data.error || 'Could not load profile');
          return;
        }
        setProfile(data.profile);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, wrestlerId]);

  const fullName = profile
    ? [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 space-y-1">
          <DialogTitle className="text-lg">Athlete profile</DialogTitle>
          <DialogDescription>Contact info and training history with you</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : error ? (
          <div className="px-4 pb-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-3 w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : profile ? (
          <div className="px-4 pb-4 space-y-4">
            <div className="flex items-start gap-3">
              <ProfileImage
                src={profile.photoUrl}
                alt={fullName}
                focusX={profile.photoFocusX}
                focusY={profile.photoFocusY}
                className="w-16 h-16 border-2 border-accent/30 shrink-0"
                fallbackIconClassName="h-8 w-8 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold leading-tight">{fullName}</h2>
                  <CoachSessionBadge totalSessions={profile.completedWithCoach} size="sm" />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  {profile.age != null ? <span>{profile.age} yrs</span> : null}
                  {profile.weightClass ? <span>{profile.weightClass}</span> : null}
                  {profile.skillLevel ? <span>{profile.skillLevel}</span> : null}
                  {profile.graduationYear ? <span>Class of {profile.graduationYear}</span> : null}
                </div>
                {profile.school ? (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{profile.school}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/30 px-2 py-2">
                <p className="text-lg font-semibold tabular-nums">{profile.sessionsWithCoach}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessions</p>
              </div>
              <div className="rounded-lg bg-muted/30 px-2 py-2">
                <p className="text-lg font-semibold tabular-nums">{profile.completedWithCoach}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</p>
              </div>
              <div className="rounded-lg bg-muted/30 px-2 py-2">
                <p className="text-lg font-semibold tabular-nums">{profile.upcomingWithCoach}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Upcoming</p>
              </div>
            </div>

            {profile.lastSessionAt ? (
              <p className="text-xs text-muted-foreground">
                Last session with you:{' '}
                <span className="text-foreground font-medium">
                  {formatEST(profile.lastSessionAt, 'MMM d, yyyy')}
                </span>
              </p>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
              {profile.parent ? (
                <ContactBlock
                  title="Parent"
                  name={[profile.parent.firstName, profile.parent.lastName].filter(Boolean).join(' ').trim()}
                  phone={profile.parent.phone}
                  email={profile.parent.email}
                />
              ) : null}
              <ContactBlock
                title="Athlete"
                name={fullName}
                phone={profile.athletePhone}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              Back to schedule
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
