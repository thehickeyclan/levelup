-- Activity feed: post when a coach creates a session.
-- Public sessions appear in the Guild feed; invite-only/private sessions remain coach-visible only.

ALTER TABLE public.activity_posts
  DROP CONSTRAINT IF EXISTS activity_posts_trigger_type_check;

ALTER TABLE public.activity_posts
  ADD CONSTRAINT activity_posts_trigger_type_check CHECK (trigger_type IN (
    'session_created', 'session_completed', 'milestone_hit', 'photo_post', 'review_posted',
    'booking_confirmed', 'market_purchase', 'market_listing_sold', 'market_trade_completed',
    'market_listing_published'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_session_created
  ON public.activity_posts (session_id)
  WHERE trigger_type = 'session_created' AND session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activity_feed_on_coach_session_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Coach/admin-created sessions use the coach id as both owner and athlete.
  -- Parent-created private bookings have a different parent_id and are excluded.
  IF NEW.status = 'scheduled'
     AND NEW.athlete_id IS NOT NULL
     AND NEW.parent_id = NEW.athlete_id THEN
    INSERT INTO public.activity_posts (
      trigger_type,
      coach_id,
      session_id,
      is_public,
      parent_approved
    ) VALUES (
      'session_created',
      NEW.athlete_id,
      NEW.id,
      COALESCE(NEW.join_policy, 'public') = 'public',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_feed_on_coach_session_created_insert ON public.sessions;
CREATE TRIGGER activity_feed_on_coach_session_created_insert
  AFTER INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_feed_on_coach_session_created();
