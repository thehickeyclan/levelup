-- Announce a coach once they become discoverable, and deduplicate nearby alerts.

ALTER TABLE public.activity_posts
  DROP CONSTRAINT IF EXISTS activity_posts_trigger_type_check;

ALTER TABLE public.activity_posts
  ADD CONSTRAINT activity_posts_trigger_type_check CHECK (trigger_type IN (
    'coach_joined', 'session_created', 'session_completed', 'milestone_hit', 'photo_post',
    'review_posted', 'booking_confirmed', 'market_purchase', 'market_listing_sold',
    'market_trade_completed', 'market_listing_published', 'market_collection_listed'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_coach_joined
  ON public.activity_posts (coach_id)
  WHERE trigger_type = 'coach_joined' AND coach_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nearby_coach_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  distance_miles numeric(7,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_nearby_coach_alerts_parent
  ON public.nearby_coach_alerts (parent_id, created_at DESC);

ALTER TABLE public.nearby_coach_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nearby_coach_alerts_service_all ON public.nearby_coach_alerts;
CREATE POLICY nearby_coach_alerts_service_all ON public.nearby_coach_alerts
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.nearby_coach_alerts IS
  'One row per parent and newly discoverable coach; prevents duplicate proximity alerts.';
