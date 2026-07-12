'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import {
  CoachMilestoneFooterActions,
  CoachMilestoneScreen,
} from '@/components/coach/coach-milestone-screen';
import {
  COACH_WHILE_YOU_WAIT_TIPS,
  coachApprovedNextSteps,
  type CoachMilestoneStep,
} from '@/lib/coach-milestone-steps';

type Props = {
  coachId: string;
  firstName: string | null;
  bookingUrl: string;
};

export function CoachWelcomeClient({ coachId, firstName, bookingUrl }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const markSeen = async () => {
    const res = await fetch('/api/coach/welcome-seen', { method: 'POST' });
    if (!res.ok) throw new Error('Could not save progress');
  };

  const markSeenQuietly = () => {
    void markSeen().catch(() => {
      /* non-blocking — schedule must stay reachable */
    });
  };

  const goToSchedule = async () => {
    setLoading(true);
    try {
      await markSeen();
      router.push('/athlete-dashboard');
      router.refresh();
    } catch {
      setLoading(false);
    }
  };

  const onStepNavigate = (_step: CoachMilestoneStep) => {
    markSeenQuietly();
  };

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your booking link:', bookingUrl);
    }
  };

  const steps = coachApprovedNextSteps(coachId);

  return (
    <CoachMilestoneScreen
      icon={<CheckCircle2 className="h-8 w-8 text-[#B89D60]" aria-hidden />}
      title={firstName ? `You're in, ${firstName}!` : "You're approved!"}
      description="Welcome to The Guild. Finish setup when you can — you can always open Schedule to close out sessions or manage your calendar."
      steps={steps}
      activeStepIndex={0}
      onStepNavigate={onStepNavigate}
      tips={[
        'Schedule shows a Close out section at the top for past sessions waiting on you',
        ...COACH_WHILE_YOU_WAIT_TIPS.slice(1),
        'Your launch graphics and share tools are on your dashboard once a session is live',
      ]}
      tipsTitle="Launch kit"
      footer={
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Your booking link</p>
            <p className="text-xs font-mono text-foreground break-all">{bookingUrl}</p>
            <button
              type="button"
              onClick={copyBookingLink}
              className="text-sm font-medium text-[#B89D60] hover:underline"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <CoachMilestoneFooterActions
            primary={{
              label: loading ? 'Opening…' : 'Go to Schedule',
              onClick: goToSchedule,
              disabled: loading,
            }}
            secondary={{ label: 'Set up profile', href: '/onboarding' }}
          />
        </div>
      }
    />
  );
}
