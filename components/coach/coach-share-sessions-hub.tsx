'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ImageIcon, QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SessionShareGraphicPanel,
  ShareGraphicScopePicker,
  type ShareGraphicScope,
} from '@/components/coach/session-share-graphic-panel';
import { resolveShareGraphicTheme } from '@/lib/session-share-graphic/themes';
import { formatEST } from '@/lib/format-date';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

export type CoachShareSessionOption = {
  sessionId: string;
  scheduledDatetime: string;
  shareUrl?: string;
};

type Props = {
  coachId: string;
  coachDisplayName: string;
  coachSchool?: string | null;
  scheduleUrl: string;
  upcomingSessions?: CoachShareSessionOption[];
  className?: string;
};

function sessionSignupUrl(scheduleUrl: string, sessionId: string): string {
  try {
    return new URL(`/sessions/${sessionId}/register`, scheduleUrl).href;
  } catch {
    return `${scheduleUrl.replace(/\/$/, '')}/sessions/${sessionId}/register`;
  }
}

export function CoachShareSessionsHub({
  coachId,
  coachDisplayName,
  coachSchool,
  scheduleUrl,
  upcomingSessions = [],
  className,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [graphicOpen, setGraphicOpen] = useState(false);
  const [graphicScope, setGraphicScope] = useState<ShareGraphicScope>(
    upcomingSessions.length === 1 ? 'single-session' : 'all-sessions'
  );
  const [graphicSessionId, setGraphicSessionId] = useState<string | null>(
    upcomingSessions[0]?.sessionId ?? null
  );

  const defaultTheme = resolveShareGraphicTheme(coachSchool);
  const weeklyCaption = `All my upcoming sessions with ${coachDisplayName}: ${scheduleUrl}`;

  const pickedSession = useMemo(() => {
    const id = graphicSessionId ?? upcomingSessions[0]?.sessionId;
    return upcomingSessions.find((s) => s.sessionId === id) ?? upcomingSessions[0] ?? null;
  }, [graphicSessionId, upcomingSessions]);

  const shareCaption = useMemo(() => {
    if (graphicScope === 'all-sessions') return weeklyCaption;
    if (!pickedSession) return weeklyCaption;
    const when = formatEST(new Date(pickedSession.scheduledDatetime), 'EEE, MMM d · h:mm a');
    const url = pickedSession.shareUrl ?? sessionSignupUrl(scheduleUrl, pickedSession.sessionId);
    return `Join my session ${when}: ${url}`;
  }, [graphicScope, pickedSession, scheduleUrl, weeklyCaption]);

  const copyScheduleUrl = async () => {
    const ok = await copyTextToClipboard(scheduleUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className={className ?? 'rounded-xl border border-accent/25 bg-card p-4 space-y-4'}>
        <div className="flex items-start gap-2">
          <Share2 className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-sm">Share your sessions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              One link and QR for every session on your schedule, or an Instagram graphic for one
              session or all upcoming times.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">All sessions link</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 text-[11px] sm:text-xs break-all bg-muted/40 px-2 py-2 rounded border border-border/60 min-h-[44px] flex items-center">
              {scheduleUrl}
            </code>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] gap-1.5"
                onClick={() => void copyScheduleUrl()}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button type="button" variant="outline" size="sm" className="min-h-[44px] gap-1.5" asChild>
                <Link href={`/qr/coach/${coachId}`} target="_blank" rel="noopener noreferrer">
                  <QrCode className="h-4 w-4" />
                  QR
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="default"
          className="w-full min-h-[44px] gap-2 bg-accent text-black hover:bg-accent-hover"
          onClick={() => setGraphicOpen(true)}
        >
          <ImageIcon className="h-4 w-4" />
          {upcomingSessions.length > 0 ? 'Create Instagram graphic' : 'Preview Instagram graphic'}
        </Button>
      </div>

      <Dialog open={graphicOpen} onOpenChange={setGraphicOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Instagram graphic</DialogTitle>
            <DialogDescription>
              Promote one session or every upcoming time for {coachDisplayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ShareGraphicScopePicker scope={graphicScope} onScopeChange={setGraphicScope} />
            {graphicScope === 'single-session' && upcomingSessions.length > 1 ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Which session?</Label>
                <Select
                  value={graphicSessionId ?? upcomingSessions[0]?.sessionId}
                  onValueChange={setGraphicSessionId}
                >
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Choose a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {upcomingSessions.map((s) => (
                      <SelectItem key={s.sessionId} value={s.sessionId}>
                        {formatEST(new Date(s.scheduledDatetime), 'EEE, MMM d · h:mm a')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <SessionShareGraphicPanel
              coachId={coachId}
              scope={graphicScope}
              sessionId={
                graphicScope === 'single-session'
                  ? pickedSession?.sessionId
                  : undefined
              }
              defaultTheme={defaultTheme}
              scheduleUrl={scheduleUrl}
              shareCaption={shareCaption}
              className="border-0 p-0 shadow-none"
            />
            <p className="text-xs text-muted-foreground">
              Suggested caption:{' '}
              <span className="text-foreground/80">{shareCaption}</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
