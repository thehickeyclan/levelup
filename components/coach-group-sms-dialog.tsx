'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { openPasteGroupSms, type GroupSmsPlan } from '@/lib/personal-sms';
import { MessageCircle } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Extract<GroupSmsPlan, { mode: 'paste' }> | null;
  recipientLabel: string;
};

export function CoachGroupSmsDialog({ open, onOpenChange, plan, recipientLabel }: Props) {
  if (!plan) return null;

  const label = plan.count === 1 ? recipientLabel : `${recipientLabel}s`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-accent shrink-0" aria-hidden />
            Text {plan.count} {label}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground pt-1">
              <p>
                iPhone only opens one number from a link. For a group text, copy every number, then
                paste into <span className="font-medium text-foreground">To</span> in Messages.
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-foreground/90">
                <li>Tap <span className="font-medium">Copy &amp; open Messages</span> below</li>
                <li>In Messages, tap the <span className="font-medium">To</span> field</li>
                <li>Tap <span className="font-medium">Paste</span> — all {plan.count} numbers appear</li>
                <li>Send the reminder (already filled in)</li>
              </ol>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-semibold"
            onClick={() => {
              const copied = openPasteGroupSms(plan);
              onOpenChange(false);
              if (!copied) {
                window.setTimeout(() => {
                  window.alert(
                    `Could not copy automatically. Paste these numbers into To (one per line):\n\n${plan.pasteList}`
                  );
                }, 300);
              }
            }}
          >
            Copy &amp; open Messages
          </Button>
          <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
