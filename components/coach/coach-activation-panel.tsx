'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Circle, CalendarPlus, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoachActivationPanelData } from '@/lib/coach-activation-server';

type Props = CoachActivationPanelData;

export function CoachActivationPanel({
  steps,
  coreComplete,
  slotNudges,
  bookingUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const incompleteSteps = steps.filter((s) => s.id !== 'share' && !s.done);
  const shareStep = steps.find((s) => s.id === 'share');

  const handleCopyBookingLink = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}${bookingUrl}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      {!coreComplete ? (
        <section
          aria-label="Get bookable checklist"
          className="rounded-xl border border-accent/30 bg-card px-4 py-3.5 space-y-3"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">Get bookable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {incompleteSteps.length} step{incompleteSteps.length !== 1 ? 's' : ''} left — parents
              can book when these are done.
            </p>
          </div>
          <ol className="space-y-2">
            {steps
              .filter((s) => s.id !== 'share')
              .map((step) => (
                <li key={step.id} className="flex items-start gap-2.5">
                  {step.done ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" aria-hidden />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60 mt-0.5" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    {step.done ? (
                      <p className="text-sm text-muted-foreground line-through">{step.label}</p>
                    ) : step.href ? (
                      <Link href={step.href} className="text-sm font-medium text-accent hover:underline">
                        {step.label}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                    )}
                    {!step.done ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
          </ol>
        </section>
      ) : shareStep ? (
        <section
          aria-label="Share booking link"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 space-y-2"
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">You&apos;re bookable</p>
          </div>
          <p className="text-xs text-muted-foreground">{shareStep.description}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopyBookingLink}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy booking link
              </>
            )}
          </Button>
        </section>
      ) : null}

      {slotNudges.length > 0 ? (
        <section
          aria-label="Suggested open slots"
          className="rounded-xl border border-border bg-muted/20 px-4 py-3.5 space-y-2.5"
        >
          <div className="flex items-start gap-2">
            <CalendarPlus className="h-4 w-4 shrink-0 text-accent mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">Open a small group?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You have calendar time with no public session posted. Tap to pre-fill create
                session — you confirm before it goes live.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {slotNudges.map((nudge) => (
              <Button key={`${nudge.date}-${nudge.time}`} asChild size="sm" variant="secondary">
                <Link href={nudge.createUrl}>{nudge.label}</Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
