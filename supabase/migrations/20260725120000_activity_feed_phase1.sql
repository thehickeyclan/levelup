-- Activity Feed Phase 1: session_completed + milestone_hit posts, kudos

ALTER TABLE public.youth_wrestlers
  ADD COLUMN IF NOT EXISTS can_post_photos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_parent_approval boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_market_activity_in_feed boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.activity_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'session_completed', 'milestone_hit', 'photo_post', 'review_posted',
    'booking_confirmed', 'market_purchase', 'market_listing_sold', 'market_trade_completed'
  )),
  actor_parent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  youth_wrestler_id uuid REFERENCES public.youth_wrestlers(id) ON DELETE SET NULL,
  coach_id uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES public.reward_milestones(id) ON DELETE SET NULL,
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  market_order_id uuid REFERENCES public.market_orders(id) ON DELETE SET NULL,
  market_listing_id uuid REFERENCES public.market_listings(id) ON DELETE SET NULL,
  market_trade_id uuid REFERENCES public.market_trades(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  caption text CHECK (char_length(caption) <= 280),
  is_public boolean DEFAULT true,
  athlete_name_public boolean DEFAULT false,
  parent_approved boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_session_completed
  ON public.activity_posts (session_id, youth_wrestler_id)
  WHERE trigger_type = 'session_completed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_photo_per_session
  ON public.activity_posts (session_id, youth_wrestler_id)
  WHERE trigger_type = 'photo_post';

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_milestone_hit
  ON public.activity_posts (milestone_id)
  WHERE trigger_type = 'milestone_hit' AND milestone_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.activity_kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.activity_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_posts_created
  ON public.activity_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_posts_youth_wrestler
  ON public.activity_posts (youth_wrestler_id);
CREATE INDEX IF NOT EXISTS idx_activity_posts_coach
  ON public.activity_posts (coach_id);
CREATE INDEX IF NOT EXISTS idx_activity_posts_session
  ON public.activity_posts (session_id);
CREATE INDEX IF NOT EXISTS idx_activity_kudos_post
  ON public.activity_kudos (post_id);

ALTER TABLE public.activity_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_kudos ENABLE ROW LEVEL SECURITY;

-- Posts: service role inserts; authenticated users read public or related posts
DROP POLICY IF EXISTS activity_posts_service_all ON public.activity_posts;
CREATE POLICY activity_posts_service_all ON public.activity_posts
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS activity_posts_select ON public.activity_posts;
CREATE POLICY activity_posts_select ON public.activity_posts
  FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR actor_parent_id = auth.uid()
    OR youth_wrestler_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.youth_wrestlers yw
      WHERE yw.id = activity_posts.youth_wrestler_id
        AND yw.parent_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.youth_wrestler_parents ywp
      WHERE ywp.youth_wrestler_id = activity_posts.youth_wrestler_id
        AND ywp.parent_id = auth.uid()
    )
  );

-- Kudos
DROP POLICY IF EXISTS activity_kudos_service_all ON public.activity_kudos;
CREATE POLICY activity_kudos_service_all ON public.activity_kudos
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS activity_kudos_select ON public.activity_kudos;
CREATE POLICY activity_kudos_select ON public.activity_kudos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_posts p
      WHERE p.id = activity_kudos.post_id
        AND (
          p.is_public = true
          OR p.actor_parent_id = auth.uid()
          OR p.youth_wrestler_id = auth.uid()
          OR p.coach_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestlers yw
            WHERE yw.id = p.youth_wrestler_id AND yw.parent_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestler_parents ywp
            WHERE ywp.youth_wrestler_id = p.youth_wrestler_id AND ywp.parent_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS activity_kudos_insert ON public.activity_kudos;
CREATE POLICY activity_kudos_insert ON public.activity_kudos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.activity_posts p
      WHERE p.id = activity_kudos.post_id
        AND (
          p.is_public = true
          OR p.actor_parent_id = auth.uid()
          OR p.youth_wrestler_id = auth.uid()
          OR p.coach_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestlers yw
            WHERE yw.id = p.youth_wrestler_id AND yw.parent_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestler_parents ywp
            WHERE ywp.youth_wrestler_id = p.youth_wrestler_id AND ywp.parent_id = auth.uid()
          )
        )
    )
  );
