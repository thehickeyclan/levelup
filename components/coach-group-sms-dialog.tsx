'use client';

import { useRef, useState } from 'react';
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
  isIosSmsDevice,
  openPasteGroupSms,
  openSmsHref,
  type GroupSmsPlan,
} from '@/lib/personal-sms';
import { copyTextToClipboardSync } from '@/lib/copy-to-clipboard';
import { Check, Copy, MessageCircle } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Extract<GroupSmsPlan, { mode: 'paste' }> | null;
  recipientLabel: string;
};

export function CoachGroupSmsDialog({ open, onOpenChange, plan, recipientLabel }: Props) {
  const numbersRef = useRef<HTMLTextAreaElement>(null);
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [openedMessages, setOpenedMessages] = useState(false);

  if (!plan) return null;

  const label = plan.count === 1 ? recipientLabel : `${recipientLabel}s`;
  const ios = isIosSmsDevice();
  const pasteHint = ios
    ? 'comma-separated numbers copied — tap To, then Paste'
    : 'one number per line copied — tap To, then Paste';

  const flashCopied = (which: 'numbers' | 'message') => {
    if (which === 'numbers') {
      setCopiedNumbers(true);
      window.setTimeout(() => setCopiedNumbers(false), 2000);
    } else {
      setCopiedMessage(true);
      window.setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  const selectNumbersField = () => {
    const el = numbersRef.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const copyNumbers = (): boolean => {
    const ok = copyTextToClipboardSync(plan.pasteList);
    if (ok) flashCopied('numbers');
    else selectNumbersField();
    return ok;
  };

  const copyMessage = (): boolean => {
    const ok = copyTextToClipboardSync(plan.body);
    if (ok) flashCopied('message');
    return ok;
  };

  const onCopyAndOpen = () => {
    const copied = openPasteGroupSms(plan);
    setOpenedMessages(true);
    if (!copied) {
      window.setTimeout(selectNumbersField, 100);
    } else {
      flashCopied('numbers');
    }
  };

  const onOpenOnly = () => {
    openSmsHref(plan.href);
    setOpenedMessages(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopiedNumbers(false);
          setCopiedMessage(false);
          setOpenedMessages(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-accent shrink-0" aria-hidden />
            Text {plan.count} {label}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground pt-1">
              <p>
                iPhone cannot add multiple people from a link. Copy the numbers below, open Messages, paste into{' '}
                <span className="font-medium text-foreground">To</span>, then send the reminder.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-foreground/90">
                <li>Tap <span className="font-medium">Copy numbers &amp; open Messages</span></li>
                <li>In Messages, tap <span className="font-medium">To</span> → <span className="font-medium">Paste</span></li>
                <li>Confirm all {plan.count} numbers appear, then send</li>
              </ol>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-sms-numbers" className="text-foreground">
              Numbers ({pasteHint})
            </Label>
            <Textarea
              id="group-sms-numbers"
              ref={numbersRef}
              readOnly
              value={plan.pasteList}
              className="min-h-[72px] font-mono text-sm resize-none"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-sms-body" className="text-foreground">
              Reminder message
            </Label>
            <Textarea
              id="group-sms-body"
              readOnly
              value={plan.body}
              className="min-h-[88px] text-sm resize-none"
            />
          </div>

          {openedMessages && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Messages should be open. If To is empty, long-press the numbers box above → Copy, then Paste into To.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-semibold"
            onClick={onCopyAndOpen}
          >
            Copy numbers &amp; open Messages
          </Button>
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={copyNumbers}>
              {copiedNumbers ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copiedNumbers ? 'Copied' : 'Copy numbers'}
            </Button>
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={copyMessage}>
              {copiedMessage ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copiedMessage ? 'Copied' : 'Copy message'}
            </Button>
          </div>
          <Button type="button" variant="ghost" className="w-full min-h-[40px] text-muted-foreground" onClick={onOpenOnly}>
            Open Messages only (no copy)
          </Button>
          <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
