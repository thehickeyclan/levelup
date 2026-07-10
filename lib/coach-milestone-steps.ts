import type { LucideIcon } from 'lucide-react';
import { Calendar, Camera, Link2, Megaphone, PartyPopper, Share2, Sparkles } from 'lucide-react';
import { coachPublicSchedulePath } from '@/lib/coach-public-schedule-url';

export type CoachMilestoneStep = {
  id: string;
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
};

export const COACH_APPLICATION_SUBMITTED_STEPS: CoachMilestoneStep[] = [
  {
    id: 'submitted',
    title: 'Application received',
    description: 'Your profile and payout details are on file.',
    icon: PartyPopper,
  },
  {
    id: 'review',
    title: 'Guild review',
    description: 'We typically respond within 24–48 hours.',
    icon: Sparkles,
  },
  {
    id: 'approved',
    title: 'Get approved & go live',
    description: 'Open your calendar, post sessions, and share your booking link.',
    icon: Calendar,
  },
];

export const COACH_WHILE_YOU_WAIT_TIPS = [
  'Finish SafeSport and background-check docs if you still need them',
  'Pick a strong profile photo (parents book coaches they recognize)',
  'Sketch your weekly availability — evenings and weekends fill first',
];

export function coachApprovedNextSteps(coachId: string): CoachMilestoneStep[] {
  const bookingPath = coachPublicSchedulePath(coachId);
  return [
    {
      id: 'photo',
      title: 'Add your profile photo',
      description: 'Parents book coaches they recognize — takes two minutes.',
      href: '/onboarding',
      icon: Camera,
    },
    {
      id: 'calendar',
      title: 'Open your calendar',
      description: 'Add weekly availability so families can book 1:1 at Guild rates.',
      href: '/availability',
      icon: Calendar,
    },
    {
      id: 'session',
      title: 'Post your first open session',
      description: 'Small group or partner sessions fill fastest on the map.',
      href: '/coach-sessions/create',
      icon: Megaphone,
    },
    {
      id: 'link',
      title: 'Copy your booking link',
      description: 'Share with families, team chats, and social — this is your growth engine.',
      href: bookingPath,
      icon: Link2,
    },
    {
      id: 'launch',
      title: 'Post your launch announcement',
      description: 'Tell your network you coach on The Guild — graphics live on your dashboard.',
      href: '/athlete-dashboard',
      icon: Share2,
    },
  ];
}
