import type { ActivityKudosByReaction, ActivityReactionId } from '@/lib/activity-feed/kudos-reactions';

export type ActivityTriggerType =
  | 'coach_joined'
  | 'session_created'
  | 'session_completed'
  | 'milestone_hit'
  | 'photo_post'
  | 'review_posted'
  | 'booking_confirmed'
  | 'market_purchase'
  | 'market_listing_sold'
  | 'market_trade_completed'
  | 'market_listing_published'
  | 'market_collection_listed';

export type ActivityFeedScope = 'community' | 'family' | 'coach';

export type ActivityFeedWrestler = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  school?: string | null;
};

export type ActivityFeedCoach = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

export type ActivityFeedSession = {
  id: string;
  session_type?: string | null;
  session_mode?: string | null;
  scheduled_datetime: string;
  duration_minutes?: number | null;
  join_policy?: string | null;
  partner_invite_code?: string | null;
  facilities?: { name?: string } | { name?: string }[] | null;
};

export type ActivityFeedReview = {
  id: string;
  rating: number;
  comment?: string | null;
};

export type ActivityFeedPhoto = {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

export type ActivityFeedMilestone = {
  id: string;
  milestone: string;
};

export type ActivityFeedMarketListing = {
  id: string;
  brand?: string | null;
  model?: string | null;
  title?: string | null;
  colorway?: string | null;
  listing_type?: string | null;
};

export type ActivityFeedPost = {
  id: string;
  trigger_type: ActivityTriggerType;
  created_at: string;
  caption?: string | null;
  actor_parent_id?: string | null;
  youth_wrestler_id?: string | null;
  coach_id?: string | null;
  session_id?: string | null;
  milestone_id?: string | null;
  review_id?: string | null;
  market_listing_id?: string | null;
  market_listings?: ActivityFeedMarketListing | ActivityFeedMarketListing[] | null;
  youth_wrestlers?: ActivityFeedWrestler | ActivityFeedWrestler[] | null;
  athletes?: ActivityFeedCoach | ActivityFeedCoach[] | null;
  sessions?: ActivityFeedSession | ActivityFeedSession[] | null;
  reward_milestones?: ActivityFeedMilestone | ActivityFeedMilestone[] | null;
  reviews?: ActivityFeedReview | ActivityFeedReview[] | null;
  photos?: ActivityFeedPhoto[];
  seller_display_name?: string | null;
  seller_photo_url?: string | null;
  /** True when the viewer can remove photos from this post. */
  viewer_can_manage_photos?: boolean;
  kudos_count: number;
  kudos_by_reaction: ActivityKudosByReaction;
  viewer_reactions: ActivityReactionId[];
};
