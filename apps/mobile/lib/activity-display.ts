export type MobileActivityPerson = {
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

export type MobileActivityPost = {
  trigger_type: string;
  caption?: string | null;
  athletes?: MobileActivityPerson | MobileActivityPerson[] | null;
  youth_wrestlers?: MobileActivityPerson | MobileActivityPerson[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function personName(person: MobileActivityPerson | null, fallback: string): string {
  if (!person) return fallback;
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || fallback;
}

/** One source of truth for Activity titles across the native app. */
export function mobileActivityTitle(post: MobileActivityPost): string {
  const coachName = personName(first(post.athletes), 'A coach');
  const wrestlerName = personName(first(post.youth_wrestlers), 'An athlete');

  switch (post.trigger_type) {
    case 'coach_joined':
      return `${coachName} joined The Guild`;
    case 'session_created':
      return `${coachName} posted new training`;
    case 'session_completed':
      return `${wrestlerName} completed a Guild session`;
    case 'booking_confirmed':
      return `${wrestlerName} joined a session`;
    case 'milestone_hit':
      return `${wrestlerName} reached a Guild milestone`;
    case 'review_posted':
      return 'A coach received a new review';
    case 'photo_post':
      return `${coachName !== 'A coach' ? coachName : wrestlerName} shared session photos`;
    case 'market_listing_published':
    case 'market_collection_listed':
      return 'A new pair was listed in Guild Market';
    case 'market_listing_sold':
      return 'A pair sold in Guild Market';
    case 'market_trade_completed':
      return 'A Guild Market trade was completed';
    case 'market_purchase':
      return 'A Guild Market purchase was completed';
    default:
      return post.caption?.trim() || 'New activity in The Guild';
  }
}
