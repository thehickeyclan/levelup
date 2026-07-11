export type ActivityTriggerType =
  | 'session_completed'
  | 'milestone_hit'
  | 'photo_post'
  | 'review_posted'
  | 'booking_confirmed'
  | 'market_purchase'
  | 'market_listing_sold'
  | 'market_trade_completed';

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
  facilities?: { name?: string } | { name?: string }[] | null;
};

export type ActivityFeedReview = {
  id: string;
  rating: number;
  comment?: string | null;
};

export type ActivityFeedPhoto = {
  storage_path: string;
  display_order: number;
  url: string;
};

export type ActivityFeedMilestone = {
  id: string;
  milestone: string;
};

export type ActivityFeedPost = {
  id: string;
  trigger_type: ActivityTriggerType;
  created_at: string;
  caption?: string | null;
  youth_wrestler_id?: string | null;
  coach_id?: string | null;
  session_id?: string | null;
  milestone_id?: string | null;
  review_id?: string | null;
  youth_wrestlers?: ActivityFeedWrestler | ActivityFeedWrestler[] | null;
  athletes?: ActivityFeedCoach | ActivityFeedCoach[] | null;
  sessions?: ActivityFeedSession | ActivityFeedSession[] | null;
  reward_milestones?: ActivityFeedMilestone | ActivityFeedMilestone[] | null;
  reviews?: ActivityFeedReview | ActivityFeedReview[] | null;
  photos?: ActivityFeedPhoto[];
  hammer_count: number;
  viewer_has_hammer: boolean;
};
