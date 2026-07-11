import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { milestoneLabelForKey } from '@/lib/activity-feed/milestone-label';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { formatEST } from '@/lib/format-date';

function first<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

export function wrestlerDisplayName(post: ActivityFeedPost): string {
  const yw = first(post.youth_wrestlers);
  if (!yw) return 'Athlete';
  return [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim() || 'Athlete';
}

export function coachDisplayName(post: ActivityFeedPost): string {
  const coach = first(post.athletes);
  if (!coach) return 'Coach';
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || 'Coach';
}

export function activityPostHeadline(post: ActivityFeedPost): string {
  const name = wrestlerDisplayName(post);
  if (post.trigger_type === 'milestone_hit') return `${name} hit a milestone!`;
  if (post.trigger_type === 'session_completed') return `${name} completed a session`;
  if (post.trigger_type === 'photo_post') {
    if (post.youth_wrestler_id) return `${name} shared session photos`;
    return `${coachDisplayName(post)} shared session photos`;
  }
  return `${name} posted`;
}

export function activityPostSubline(post: ActivityFeedPost): string | null {
  if (post.trigger_type === 'milestone_hit') {
    const ms = first(post.reward_milestones);
    if (!ms?.milestone) return null;
    return `🏆 ${milestoneLabelForKey(ms.milestone)}`;
  }

  const session = first(post.sessions);
  if (!session) return null;

  const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;
  const coach = coachDisplayName(post);
  const facilityRow = first(session.facilities);
  const facility = facilityRow?.name?.trim();
  const dt = new Date(session.scheduled_datetime);
  const when = formatEST(dt, 'MMM d') === formatEST(new Date(), 'MMM d')
    ? `Today at ${formatEST(dt, 'h:mm a')}`
    : `${formatEST(dt, 'EEE, MMM d')} at ${formatEST(dt, 'h:mm a')}`;
  const dur = session.duration_minutes ? ` · ${session.duration_minutes} min` : '';

  const parts = [`${typeLabel} with ${coach}`];
  if (facility) parts.push(facility);
  parts.push(`${when}${dur}`);
  return parts.join(' · ');
}

export function activityPostReviewLine(post: ActivityFeedPost): string | null {
  const review = first(post.reviews);
  if (!review?.rating) return null;

  const stars = '★'.repeat(Math.min(5, Math.max(1, Math.round(review.rating))));
  const snippet = review.comment?.trim();
  if (snippet) {
    const short = snippet.length > 120 ? `${snippet.slice(0, 117)}…` : snippet;
    return `${stars} · "${short}"`;
  }
  return `${stars} review`;
}

export function activityPostAvatarUrl(post: ActivityFeedPost): string | null {
  const yw = first(post.youth_wrestlers);
  return yw?.photo_url?.trim() || null;
}

export function activityPostCoachAvatarUrl(post: ActivityFeedPost): string | null {
  const coach = first(post.athletes);
  return coach?.photo_url?.trim() || null;
}
