import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatGraduationYearLabel,
  formatSkillLevelLabel,
  SKILL_BADGE_CLASS,
  skillBadgeVariant,
  type SessionRosterParticipant,
} from '@/lib/wrestler-roster-display';

type FitBadgeProps = {
  children: ReactNode;
  className?: string;
};

function FitBadge({ children, className }: FitBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-medium px-1.5 py-0 h-5 border-zinc-700 bg-zinc-900/80 text-zinc-300',
        className
      )}
    >
      {children}
    </Badge>
  );
}

export function WrestlerFitBadges({
  participant,
  compact = false,
  className,
}: {
  participant: Pick<
    SessionRosterParticipant,
    'age' | 'weightClass' | 'skillLevel' | 'graduationYear'
  >;
  compact?: boolean;
  className?: string;
}) {
  const skill = formatSkillLevelLabel(participant.skillLevel);
  const skillVar = skillBadgeVariant(participant.skillLevel);
  const grad = formatGraduationYearLabel(participant.graduationYear);
  const hasAny =
    participant.age != null ||
    participant.weightClass ||
    skill ||
    grad;

  if (!hasAny) {
    return (
      <span className={cn('text-[10px] text-muted-foreground italic', className)}>
        {compact ? '—' : 'Profile details not added'}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {participant.age != null && (
        <FitBadge className="border-zinc-600/60 text-zinc-300">{participant.age}y</FitBadge>
      )}
      {participant.weightClass && (
        <FitBadge className="border-blue-600/40 bg-blue-950/30 text-blue-200">
          {participant.weightClass}
        </FitBadge>
      )}
      {grad && (
        <FitBadge className="border-zinc-600/60 text-zinc-400">Class {grad}</FitBadge>
      )}
      {skill && (
        <FitBadge className={SKILL_BADGE_CLASS[skillVar]}>{skill}</FitBadge>
      )}
    </span>
  );
}

export function SessionRosterRow({
  participant,
  className,
}: {
  participant: SessionRosterParticipant;
  className?: string;
}) {
  return (
    <li className={cn('flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2', className)}>
      <span className="text-xs font-medium text-foreground shrink-0">{participant.name}</span>
      <WrestlerFitBadges participant={participant} />
    </li>
  );
}

/** Compact legend for session browse cards */
export function WrestlerFitLegend({ className }: { className?: string }) {
  return (
    <p className={cn('text-[10px] text-muted-foreground leading-relaxed', className)}>
      <span className="font-semibold uppercase tracking-wide text-zinc-500">Athlete badges: </span>
      <span className="text-zinc-400">age · weight · class year · </span>
      <span className="text-emerald-400/90">Beginner</span>
      <span className="text-zinc-500"> / </span>
      <span className="text-sky-400/90">Intermediate</span>
      <span className="text-zinc-500"> / </span>
      <span className="text-amber-400/90">Advanced</span>
      <span className="text-zinc-500"> / </span>
      <span className="text-violet-400/90">Elite</span>
    </p>
  );
}

export function SessionRosterList({
  participants,
  label = 'Registered',
  className,
  emptyFallback,
}: {
  participants: SessionRosterParticipant[];
  label?: string;
  className?: string;
  emptyFallback?: string;
}) {
  if (participants.length === 0) {
    return emptyFallback ? (
      <p className={cn('text-xs text-muted-foreground', className)}>{emptyFallback}</p>
    ) : null;
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} ({participants.length})
      </p>
      <ul className="space-y-1.5">
        {participants.map((p, i) => (
          <SessionRosterRow key={`${p.name}-${i}`} participant={p} />
        ))}
      </ul>
    </div>
  );
}
