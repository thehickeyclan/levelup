import {
  buildCoachSessionShareMessage,
  coachSessionShareUrl,
  type CoachSessionShareInput,
} from '@/lib/coach-session-share';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';
import {
  activityPostHeadline,
  activityPostSubline,
  coachDisplayName,
  wrestlerDisplayName,
} from '@/lib/activity-feed/display';
import { milestoneLabelForKey } from '@/lib/activity-feed/milestone-label';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';

function first<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

function sessionShareInput(post: ActivityFeedPost): CoachSessionShareInput | null {
  const session = first(post.sessions);
  if (!session?.id) return null;
  return {
    id: session.id,
    join_policy: session.join_policy ?? null,
    partner_invite_code: session.partner_invite_code ?? null,
    scheduled_datetime: session.scheduled_datetime,
    session_type: session.session_type ?? null,
    session_mode: session.session_mode ?? null,
  };
}

function facilityName(post: ActivityFeedPost): string | undefined {
  const session = first(post.sessions);
  const facility = first(session?.facilities);
  const name = facility?.name?.trim();
  return name && name !== '—' ? name : undefined;
}

/** Caption for IG / Facebook when sharing an activity feed post. */
export function buildActivityPostShareCaption(post: ActivityFeedPost, origin: string): string {
  const base = origin.replace(/\/$/, '');
  const headline = activityPostHeadline(post);
  const subline = activityPostSubline(post);
  const coach = coachDisplayName(post);
  const scheduleUrl = post.coach_id ? coachPublicScheduleUrl(base, post.coach_id) : undefined;

  if (post.trigger_type === 'milestone_hit') {
    const ms = first(post.reward_milestones);
    const label = ms?.milestone ? milestoneLabelForKey(ms.milestone) : 'a milestone';
    const name = wrestlerDisplayName(post);
    const tail = scheduleUrl ? ` Train on The Guild: ${scheduleUrl}` : ' Train on The Guild.';
    return `${name} hit ${label} on The Guild! 🏆${tail}`;
  }

  if (post.trigger_type === 'photo_post') {
    const lines = [headline];
    if (subline) lines.push(subline);
    const caption = post.caption?.trim();
    if (caption) lines.push(caption);
    const sessionInput = sessionShareInput(post);
    if (sessionInput) {
      const url = coachSessionShareUrl(base, sessionInput);
      lines.push(`Train with ${coach} on The Guild → ${url}`);
    } else if (scheduleUrl) {
      lines.push(`Train with ${coach} on The Guild → ${scheduleUrl}`);
    }
    return lines.join('\n');
  }

  if (post.trigger_type === 'session_completed') {
    const sessionInput = sessionShareInput(post);
    if (sessionInput) {
      return buildCoachSessionShareMessage({
        coachName: coach,
        session: sessionInput,
        facility: facilityName(post),
        url: coachSessionShareUrl(base, sessionInput),
        scheduleUrl,
      });
    }
    const lines = [headline];
    if (subline) lines.push(subline);
    if (scheduleUrl) lines.push(`Train with ${coach} on The Guild → ${scheduleUrl}`);
    return lines.join('\n');
  }

  const lines = [headline];
  if (subline) lines.push(subline);
  return lines.join('\n');
}
