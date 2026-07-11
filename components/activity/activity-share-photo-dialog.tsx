'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Plus, Camera, X } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { formatEST } from '@/lib/format-date';
import { suggestSessionIdFromPhotoTime } from '@/lib/activity-feed/suggest-photo-session';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';

type PhotoSession = {
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  facilityName: string;
  coachName: string;
  wrestlers: { id: string; name: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  initialFiles?: File[];
  /** When set (e.g. from camera capture), we try to pre-select the matching session. */
  photoTakenAt?: Date | null;
};

export function ActivitySharePhotoDialog({
  open,
  onOpenChange,
  role,
  initialFiles = [],
  photoTakenAt = null,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<PhotoSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [youthWrestlerId, setYouthWrestlerId] = useState('');
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionSuggested, setSessionSuggested] = useState(false);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId]
  );

  const isCoachLike = role === 'coach' || role === 'admin';
  const wrestlerRequired = role === 'parent' || role === 'youth_wrestler';

  useEffect(() => {
    if (!open) return;
    setSessionId('');
    setYouthWrestlerId('');
    setCaption('');
    setFiles(initialFiles.slice(0, 4));
    setError(null);
    setSessionSuggested(false);
    setLoadingSessions(true);
    void fetch('/api/activity/photo-sessions')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load sessions');
        const loaded = (data.sessions ?? []) as PhotoSession[];
        setSessions(loaded);
        if (photoTakenAt && loaded.length > 0) {
          const suggested = suggestSessionIdFromPhotoTime(loaded, photoTakenAt);
          if (suggested) {
            setSessionId(suggested);
            setSessionSuggested(true);
          }
        }
      })
      .catch((e) => {
        setSessions([]);
        setError(e instanceof Error ? e.message : 'Could not load sessions');
      })
      .finally(() => setLoadingSessions(false));
  }, [open, initialFiles, photoTakenAt]);

  useEffect(() => {
    if (!selectedSession) {
      setYouthWrestlerId('');
      return;
    }
    if (role === 'youth_wrestler' && selectedSession.wrestlers.length > 0) {
      setYouthWrestlerId(selectedSession.wrestlers[0]?.id ?? '');
      return;
    }
    if (selectedSession.wrestlers.length === 1) {
      setYouthWrestlerId(selectedSession.wrestlers[0]?.id ?? '');
    } else {
      setYouthWrestlerId('');
    }
  }, [selectedSession, role]);

  const sessionLabel = (s: PhotoSession) => {
    const dt = formatEST(new Date(s.scheduled_datetime), 'EEE, MMM d · h:mm a');
    const type = getSessionTypeDisplay(s.session_type, s.session_mode).label;
    return `${dt} · ${type} · ${s.facilityName}`;
  };

  const onPickFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const next = [...files, ...Array.from(picked)].slice(0, 4);
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!sessionId) {
      setError('Pick a completed session');
      return;
    }
    if (wrestlerRequired && !youthWrestlerId && (selectedSession?.wrestlers.length ?? 0) > 0) {
      setError('Pick which athlete these photos are for');
      return;
    }
    if (files.length === 0) {
      setError('Add at least one photo');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('sessionId', sessionId);
      if (youthWrestlerId) body.set('youthWrestlerId', youthWrestlerId);
      if (caption.trim()) body.set('caption', caption.trim());
      const prepared = await prepareListingPhotos(files);
      if (prepared.prepareErrors.length > 0) {
        throw new Error(prepared.prepareErrors[0]);
      }
      for (const file of prepared.files) body.append('photos', file);

      const res = await fetch('/api/activity/photos', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5" />
            Share session photos
          </DialogTitle>
          <DialogDescription>
            On your phone, use the camera button to snap a photo. We&apos;ll suggest the session
            from when the photo was taken. Pick a completed session, then share to activity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="photo-session">Completed session</Label>
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed sessions yet. Mark a session complete first, then come back to share
                photos.
              </p>
            ) : (
              <>
                {sessionSuggested ? (
                  <p className="text-xs text-accent">
                    Suggested session from photo time — change if needed.
                  </p>
                ) : null}
                <select
                  id="photo-session"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setSessionSuggested(false);
                  }}
                >
                <option value="">Select a session…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(s)}
                  </option>
                ))}
              </select>
              </>
            )}
          </div>

          {selectedSession && wrestlerRequired && selectedSession.wrestlers.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="photo-wrestler">Athlete</Label>
              <select
                id="photo-wrestler"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={youthWrestlerId}
                onChange={(e) => setYouthWrestlerId(e.target.value)}
              >
                <option value="">Select athlete…</option>
                {selectedSession.wrestlers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selectedSession && isCoachLike && selectedSession.wrestlers.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="photo-wrestler-coach">Athlete (optional)</Label>
              <select
                id="photo-wrestler-coach"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={youthWrestlerId}
                onChange={(e) => setYouthWrestlerId(e.target.value)}
              >
                <option value="">Session photos (no specific athlete)</option>
                {selectedSession.wrestlers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="photo-caption">Caption (optional)</Label>
            <Textarea
              id="photo-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Double leg was clicking today"
              maxLength={280}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Photos (up to 4)</Label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 touch-manipulation"
                disabled={files.length >= 4}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                Camera
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 touch-manipulation"
                disabled={files.length >= 4}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                Gallery
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${file.lastModified}-${i}`}
                  className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 touch-manipulation"
                    aria-label="Remove photo"
                    onClick={() => removeFile(i)}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
              {files.length < 4 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent"
                >
                  <Plus className="h-6 w-6" />
                </button>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || sessions.length === 0 || files.length === 0 || !sessionId}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share photos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
