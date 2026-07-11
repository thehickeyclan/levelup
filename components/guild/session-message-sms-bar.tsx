'use client';

import { useState } from 'react';
import { MessageCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';

type Props = {
  sessionId: string;
  sessionLabel: string;
  participantCount: number;
  isCoach: boolean;
};

export function SessionMessageSmsBar({ sessionId, sessionLabel, participantCount, isCoach }: Props) {
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsTarget, setSmsTarget] = useState('broadcast:parents');

  if (!isCoach) return null;

  const openSms = (target: string) => {
    setSmsTarget(target);
    setSmsOpen(true);
  };

  const canSms = participantCount > 0;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 mb-4">
      <p className="text-xs font-medium text-foreground">Also reach families by text</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canSms}
          onClick={() => openSms('broadcast:parents')}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Text parents
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canSms}
          onClick={() => openSms('broadcast:athletes')}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Text athletes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canSms}
          onClick={() => openSms('broadcast:both')}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Text all
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <MessageCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        In-app messages below go to parent accounts on this session. Use SMS for athlete cells.
      </p>
      <CoachTextGroupDialog
        sessionId={sessionId}
        open={smsOpen}
        onOpenChange={setSmsOpen}
        sessionLabel={sessionLabel}
        initialTarget={smsTarget}
      />
    </div>
  );
}
