import type { SkillLevel } from '@/types';

export type WrestlerRosterFields = {
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  weight_class?: string | null;
  skill_level?: string | null;
  graduation_year?: number | null;
};

export type SessionRosterParticipant = {
  name: string;
  age?: number | null;
  weightClass?: string | null;
  skillLevel?: string | null;
  graduationYear?: number | null;
};

export function formatSkillLevelLabel(skill?: string | null): string | null {
  const s = skill?.trim().toLowerCase();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatWeightClassLabel(weight?: string | null): string | null {
  const w = weight?.trim();
  if (!w) return null;
  if (/lbs?$/i.test(w) || w.includes('kg')) return w;
  if (/^\d+(\.\d+)?$/.test(w)) return `${w} lbs`;
  return w;
}

export function formatGraduationYearLabel(year?: number | null): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  return `'${String(year).slice(-2)}`;
}

export function wrestlerDisplayName(fields: WrestlerRosterFields): string {
  return [fields.first_name, fields.last_name].filter(Boolean).join(' ').trim();
}

export function buildSessionRosterParticipant(fields: WrestlerRosterFields): SessionRosterParticipant | null {
  const name = wrestlerDisplayName(fields);
  if (!name) return null;
  return {
    name,
    age: fields.age ?? null,
    weightClass: formatWeightClassLabel(fields.weight_class),
    skillLevel: formatSkillLevelLabel(fields.skill_level),
    graduationYear: fields.graduation_year ?? null,
  };
}

export type SkillBadgeVariant = 'beginner' | 'intermediate' | 'advanced' | 'elite' | 'unknown';

export function skillBadgeVariant(skill?: string | null): SkillBadgeVariant {
  const s = skill?.trim().toLowerCase() as SkillLevel | '';
  if (s === 'beginner' || s === 'intermediate' || s === 'advanced' || s === 'elite') return s;
  return 'unknown';
}

export const SKILL_BADGE_CLASS: Record<SkillBadgeVariant, string> = {
  beginner: 'border-emerald-600/50 bg-emerald-950/40 text-emerald-300',
  intermediate: 'border-sky-600/50 bg-sky-950/40 text-sky-300',
  advanced: 'border-amber-600/50 bg-amber-950/40 text-amber-300',
  elite: 'border-violet-600/50 bg-violet-950/40 text-violet-300',
  unknown: 'border-zinc-600/50 bg-zinc-900/60 text-zinc-400',
};
