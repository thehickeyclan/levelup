'use client';

import { useState } from 'react';
import { Phone, Copy, Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { openSmsHref } from '@/lib/personal-sms';
import { cn } from '@/lib/utils';

interface ContactInfoRowProps {
  label: string;
  name?: string;
  phone?: string | null;
  className?: string;
}

export function ContactInfoRow({ label, name, phone, className }: ContactInfoRowProps) {
  const [copied, setCopied] = useState(false);

  if (!phone) return null;

  // Format phone for display: (xxx) xxx-xxxx
  const formatPhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return p;
  };

  // Get digits-only phone for SMS
  const getDigits = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    return digits;
  };

  const handleCopy = async () => {
    const digits = getDigits(phone);
    const success = await copyTextToClipboard(digits);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleText = () => {
    const digits = getDigits(phone);
    // On mobile, open SMS app; on desktop, copy and show message
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      openSmsHref(`sms:${digits}`);
    } else {
      // Copy and let them paste in their messaging app
      handleCopy();
    }
  };

  return (
    <div className={cn('flex items-start gap-2 py-1 min-w-0', className)}>
      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground leading-snug">
          {label}
          {name ? (
            <>
              <span className="mx-1" aria-hidden>
                ·
              </span>
              <span className="text-foreground/90">{name}</span>
            </>
          ) : null}
        </p>
        <p className="text-sm font-mono tabular-nums leading-snug mt-0.5 break-all">
          {formatPhone(phone)}
        </p>
      </div>
      <div className="flex items-center shrink-0 -mr-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-10 w-10 p-0 touch-manipulation"
          title="Copy phone number"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleText}
          className="h-10 w-10 p-0 touch-manipulation"
          title="Text this number"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Phone icon + number + copy/text actions — sits inline next to a coach name on profile hero. */
export function InlineCoachPhone({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);

  const formatPhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return p;
  };

  const getDigits = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    return digits;
  };

  const handleCopy = async () => {
    const digits = getDigits(phone);
    const success = await copyTextToClipboard(digits);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleText = () => {
    const digits = getDigits(phone);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      openSmsHref(`sms:${digits}`);
    } else {
      void handleCopy();
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 rounded-md border border-border/80 bg-muted/25 px-2 py-1.5 sm:py-1"
      role="group"
      aria-label="Coach phone: copy or text"
    >
      <Phone className="h-4 w-4 text-accent shrink-0" aria-hidden />
      <span className="font-mono text-sm text-foreground tabular-nums">{formatPhone(phone)}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void handleCopy()}
          className="h-9 w-9 p-0 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 touch-manipulation"
          title="Copy number"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleText}
          className="h-9 w-9 p-0 min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 touch-manipulation"
          title="Text this number (opens Messages on your phone)"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Compact version for inline use
export function PhoneCopyButton({ phone, className }: { phone: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const getDigits = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    return digits;
  };

  const handleCopy = async () => {
    const digits = getDigits(phone);
    const success = await copyTextToClipboard(digits);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn('min-h-[44px] touch-manipulation', className)}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-1 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4 mr-1" />
          Copy Phones
        </>
      )}
    </Button>
  );
}
