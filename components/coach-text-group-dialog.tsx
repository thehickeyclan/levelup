'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Smartphone } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

type RecipientOption = { value: string; label: string; group: 'everyone' | 'individual' };

type Props = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Sun, Mar 22 · 11:00 AM" */
  sessionLabel: string;
  /** Pre-fill when opened from session reminder actions */
  initialMessage?: string;
  initialTarget?: string;
  onSent?: () => void;
};

export function CoachTextGroupDialog({
  sessionId,
  open,
  onOpenChange,
  sessionLabel,
  initialMessage = '',
  initialTarget = 'broadcast:parents',
  onSent,
}: Props) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState(initialTarget);
  const [showPersonalCopy, setShowPersonalCopy] = useState(false);
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; skippedNoPhone: number } | null>(null);
  const [phones, setPhones] = useState<{
    commaAll: string;
    commaParents: string;
    commaAthletes: string;
    commaBoth: string;
    skippedParents: number;
    skippedAthletes: number;
  } | null>(null);
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [copiedKind, setCopiedKind] = useState<'parents' | 'athletes' | 'both' | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialMessage);
    setTarget(initialTarget);
    setShowPersonalCopy(false);
    setError(null);
    setResult(null);
  }, [open, sessionId, initialMessage, initialTarget]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingOptions(true);
    fetch(`/api/sessions/${sessionId}/sms-recipients`)
      .then((r) => r.json())
      .then((data: { options?: RecipientOption[] }) => {
        if (cancelled || !data.options?.length) return;
        setOptions(data.options);
        setTarget((prev) =>
          data.options!.some((o) => o.value === prev) ? prev : initialTarget || 'broadcast:parents'
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPhones(true);
    setPhones(null);
    fetch(`/api/sessions/${sessionId}/sms-phones`)
      .then((r) => r.json())
      .then(
        (data: {
          commaAll?: string;
          commaParents?: string;
          commaAthletes?: string;
          commaBoth?: string;
          skippedParents?: number;
          skippedAthletes?: number;
        }) => {
          if (cancelled) return;
          setPhones({
            commaAll: data.commaAll ?? '',
            commaParents: data.commaParents ?? '',
            commaAthletes: data.commaAthletes ?? '',
            commaBoth: data.commaBoth ?? '',
            skippedParents: data.skippedParents ?? 0,
            skippedAthletes: data.skippedAthletes ?? 0,
          });
        }
      )
      .catch(() => {
        if (!cancelled) setPhones(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPhones(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  const copyPhones = async (kind: 'parents' | 'athletes' | 'both', value: string) => {
    if (!value.trim()) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind(null), 2000);
    } else {
      setError('Could not copy — try again or copy manually.');
    }
  };

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/sms-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send');
        if (data.sent != null) setResult({ sent: data.sent, skippedNoPhone: data.skippedNoPhone ?? 0 });
        return;
      }
      setResult({ sent: data.sent ?? 0, skippedNoPhone: data.skippedNoPhone ?? 0 });
      setText('');
      onSent?.();
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setError(null);
      setResult(null);
      setText('');
      setTarget('broadcast:parents');
      setPhones(null);
      setCopiedKind(null);
      setShowPersonalCopy(false);
    }
    onOpenChange(v);
  };

  const everyoneOpts =
    options.filter((o) => o.group === 'everyone').length > 0
      ? options.filter((o) => o.group === 'everyone')
      : [
          { value: 'broadcast:parents', label: 'All parents (recommended)', group: 'everyone' as const },
          { value: 'broadcast:athletes', label: 'All athletes (wrestler cells only)', group: 'everyone' as const },
          { value: 'broadcast:both', label: 'Parents + athletes (deduped)', group: 'everyone' as const },
        ];
  const individualOpts = options.filter((o) => o.group === 'individual');

  const targetHint =
    target.startsWith('parent:') || target.startsWith('athlete:')
      ? 'Sends one SMS to that person’s number on file.'
      : target === 'broadcast:athletes'
        ? 'Athlete cells on wrestler profiles only — use for mat-day logistics, not booking.'
        : target === 'broadcast:both'
          ? 'Parents + athletes — one SMS per unique number.'
          : 'Parent account cells first (recommended for booking); athlete cell only if parent has none.';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-accent" />
            Text families
          </DialogTitle>
          <DialogDescription className="text-left space-y-2">
            <span className="block text-foreground/90">{sessionLabel}</span>
            <span className="block text-muted-foreground text-sm">
              Sends one SMS per family from The Guild&apos;s number — best for group reminders. {targetHint}
            </span>
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium text-foreground">Sent to {result.sent} number{result.sent === 1 ? '' : 's'}.</p>
            {result.skippedNoPhone > 0 && (
              <p className="text-muted-foreground">
                {result.skippedNoPhone} recipient{result.skippedNoPhone === 1 ? '' : 's'} had no cell on file for this send.
              </p>
            )}
            <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="sms-target">Send to</Label>
              <Select
                value={target}
                onValueChange={setTarget}
                disabled={sending || loadingOptions}
              >
                <SelectTrigger id="sms-target" className="min-h-[44px] w-full">
                  <SelectValue placeholder={loadingOptions ? 'Loading…' : 'Who receives this text'} />
                </SelectTrigger>
                <SelectContent className="max-h-[min(60vh,320px)]">
                  {everyoneOpts.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Everyone</SelectLabel>
                      {everyoneOpts.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {individualOpts.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>One person</SelectLabel>
                        {individualOpts.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
              {loadingOptions && <p className="text-xs text-muted-foreground">Loading roster…</p>}
            </div>

            <Textarea
              placeholder="e.g. Practice moved to 11:30 — see you at UNC."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              className="min-h-[120px] resize-y"
              maxLength={1200}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">{text.length}/1200</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-accent text-primary hover:bg-accent/90 min-h-[44px]"
                onClick={handleSend}
                disabled={sending || !text.trim() || loadingOptions}
              >
                {sending ? 'Sending…' : 'Send SMS'}
              </Button>
            </DialogFooter>

            <div className="border-t border-border pt-3 space-y-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setShowPersonalCopy((v) => !v)}
              >
                {showPersonalCopy ? 'Hide' : 'Need two-way chat from your phone?'}
              </button>
              {showPersonalCopy ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Group paste from a website is unreliable on iPhone. For a back-and-forth with one family, use{' '}
                    <strong className="text-foreground/90">Contact details</strong> in session Actions instead.
                  </p>
                  {loadingPhones && <p className="text-xs text-muted-foreground">Loading numbers…</p>}
                  {!loadingPhones && phones && (
                    <>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start min-h-[44px]"
                          disabled={!phones.commaParents}
                          onClick={() => copyPhones('parents', phones.commaParents)}
                        >
                          <Copy className="h-4 w-4 mr-2 shrink-0" />
                          {copiedKind === 'parents' ? 'Copied!' : 'Copy parent numbers'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start min-h-[44px]"
                          disabled={!phones.commaAthletes}
                          onClick={() => copyPhones('athletes', phones.commaAthletes)}
                        >
                          <Copy className="h-4 w-4 mr-2 shrink-0" />
                          {copiedKind === 'athletes' ? 'Copied!' : 'Copy athlete numbers'}
                        </Button>
                      </div>
                      {!phones.commaParents && !phones.commaAthletes && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">No cells on file for this session.</p>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
