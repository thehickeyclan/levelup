'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { COACH_ADMIN_SMS_MAX_BODY } from '@/lib/coach-admin-sms';

type CoachRow = {
  id: string;
  name: string;
  email: string;
  hasPhone: boolean;
};

type SendResult = {
  sent: number;
  skippedNoPhone: number;
  failed: number;
  targeted: number;
};

export function AdminCoachSmsClient() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllWithPhone, setSelectAllWithPhone] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const withPhone = useMemo(() => coaches.filter((c) => c.hasPhone), [coaches]);
  const withoutPhone = useMemo(() => coaches.filter((c) => !c.hasPhone), [coaches]);

  const loadCoaches = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/admin/coaches/sms-broadcast')
      .then((r) => r.json())
      .then((data: { coaches?: CoachRow[]; error?: string }) => {
        if (data.error) {
          setLoadError(data.error);
          setCoaches([]);
          return;
        }
        const list = data.coaches ?? [];
        setCoaches(list);
        const ids = new Set(list.filter((c) => c.hasPhone).map((c) => c.id));
        setSelectedIds(ids);
        setSelectAllWithPhone(true);
      })
      .catch(() => {
        setLoadError('Could not load coaches');
        setCoaches([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCoaches();
  }, [loadCoaches]);

  const previewText = message.trim()
    ? `The Guild: ${message.trim()}`.slice(0, 1600)
    : '';

  const selectedWithPhone = withPhone.filter((c) => selectedIds.has(c.id)).length;

  function toggleCoach(id: string, checked: boolean) {
    setSelectAllWithPhone(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllWithPhone(checked: boolean) {
    setSelectAllWithPhone(checked);
    if (checked) {
      setSelectedIds(new Set(withPhone.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) {
      setSendError('Enter a message first.');
      return;
    }
    if (trimmed.length > COACH_ADMIN_SMS_MAX_BODY) {
      setSendError(`Message must be ${COACH_ADMIN_SMS_MAX_BODY} characters or fewer.`);
      return;
    }
    if (selectedWithPhone === 0) {
      setSendError('Select at least one coach with a phone number.');
      return;
    }
    if (
      !window.confirm(
        `Send this text to ${selectedWithPhone} coach${selectedWithPhone === 1 ? '' : 'es'}? Each gets their own SMS.`
      )
    ) {
      return;
    }

    setSending(true);
    setSendError(null);
    setResult(null);

    const coachIds = selectAllWithPhone
      ? undefined
      : Array.from(selectedIds).filter((id) => withPhone.some((c) => c.id === id));

    try {
      const res = await fetch('/api/admin/coaches/sms-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, coachIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        const missing = Array.isArray(data.missingCoaches) ? (data.missingCoaches as CoachRow[]) : [];
        if (missing.length > 0) {
          setCoaches((prev) => {
            const byId = new Map(missing.map((c) => [c.id, c]));
            return prev.map((c) => (byId.has(c.id) ? { ...c, hasPhone: false } : c));
          });
        }
        setSendError(data.error ?? 'Send failed');
        return;
      }
      setResult(data as SendResult);
      setMessage('');
    } catch {
      setSendError('Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#B89D60]/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-[#B89D60]" />
            Text coaches
          </CardTitle>
          <CardDescription>
            One SMS per coach — best for schedule changes, payouts, and quick ops updates. Messages are prefixed with{' '}
            <span className="font-mono text-xs">The Guild:</span>. Delivery requires Twilio Messaging Service on
            production.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading coaches…
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : withoutPhone.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Cannot text coaches until every active coach has a cell</p>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {withoutPhone.map((c) => (
                      <li key={c.id}>
                        {c.name}
                        {c.email ? ` (${c.email})` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Add numbers in{' '}
                    <Link href="/admin/users" className="text-[#B89D60] hover:underline">
                      Admin → Users
                    </Link>{' '}
                    — coaches cannot go live without a cell on file.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ready to text <strong className="text-foreground">{withPhone.length}</strong> active coach
              {withPhone.length === 1 ? '' : 'es'}.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="coach-sms-body">Message (without prefix)</Label>
            <Textarea
              id="coach-sms-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Payouts for last week are in Zelle tonight. Reply if you have questions."
              rows={5}
              maxLength={COACH_ADMIN_SMS_MAX_BODY}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/{COACH_ADMIN_SMS_MAX_BODY} characters
            </p>
          </div>

          {previewText && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
              <p className="whitespace-pre-wrap break-words">{previewText}</p>
            </div>
          )}

          {withPhone.length > 0 && !loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-coaches"
                  checked={selectAllWithPhone && selectedIds.size === withPhone.length}
                  onCheckedChange={(v) => toggleAllWithPhone(v === true)}
                />
                <Label htmlFor="select-all-coaches" className="font-normal cursor-pointer">
                  All coaches with phone ({withPhone.length})
                </Label>
              </div>
              {!selectAllWithPhone && (
                <ul className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1 text-sm">
                  {withPhone.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`coach-${c.id}`}
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={(v) => toggleCoach(c.id, v === true)}
                      />
                      <Label htmlFor={`coach-${c.id}`} className="font-normal cursor-pointer">
                        {c.name}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {sendError && <p className="text-sm text-destructive">{sendError}</p>}

          {result && (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
              Sent <strong>{result.sent}</strong>
              {result.failed > 0 && (
                <>
                  {' '}
                  · <strong>{result.failed}</strong> failed (see{' '}
                  <Link href="/admin/message-log" className="text-[#B89D60] hover:underline">
                    SMS log
                  </Link>
                  )
                </>
              )}
              {result.skippedNoPhone > 0 && (
                <>
                  {' '}
                  · skipped {result.skippedNoPhone} without phone
                </>
              )}
            </div>
          )}

          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || loading || withPhone.length === 0 || withoutPhone.length > 0}
            className="bg-[#B89D60] hover:bg-[#B89D60]/90 text-white"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to {selectedWithPhone || withPhone.length} coach
                {(selectedWithPhone || withPhone.length) === 1 ? '' : 'es'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
