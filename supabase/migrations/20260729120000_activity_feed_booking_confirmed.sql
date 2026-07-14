-- Activity feed: post when a wrestler is booked onto a session (not when completed).

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_booking_confirmed
  ON public.activity_posts (session_id, youth_wrestler_id)
  WHERE trigger_type = 'booking_confirmed' AND session_id IS NOT NULL AND youth_wrestler_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_booking_confirmed_dropin
  ON public.activity_posts (session_id, actor_parent_id)
  WHERE trigger_type = 'booking_confirmed'
    AND session_id IS NOT NULL
    AND youth_wrestler_id IS NULL
    AND actor_parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activity_feed_on_participant_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_parent_id uuid;
  v_is_public boolean := true;
BEGIN
  SELECT s.athlete_id INTO v_coach_id
  FROM public.sessions s
  WHERE s.id = NEW.session_id;

  v_parent_id := NEW.parent_id;

  IF NEW.youth_wrestler_id IS NOT NULL THEN
    SELECT
      COALESCE(yw.profile_public, true),
      COALESCE(v_parent_id, yw.parent_id)
    INTO v_is_public, v_parent_id
    FROM public.youth_wrestlers yw
    WHERE yw.id = NEW.youth_wrestler_id;
  END IF;

  BEGIN
    INSERT INTO public.activity_posts (
      trigger_type,
      actor_parent_id,
      youth_wrestler_id,
      coach_id,
      session_id,
      is_public,
      parent_approved
    )
    VALUES (
      'booking_confirmed',
      v_parent_id,
      NEW.youth_wrestler_id,
      v_coach_id,
      NEW.session_id,
      COALESCE(v_is_public, true),
      true
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_feed_on_participant_booking_insert ON public.session_participants;
CREATE TRIGGER activity_feed_on_participant_booking_insert
  AFTER INSERT ON public.session_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_feed_on_participant_booking();

CREATE OR REPLACE FUNCTION public.activity_feed_on_participant_unbook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity_posts
  WHERE trigger_type = 'booking_confirmed'
    AND session_id = OLD.session_id
    AND (
      (OLD.youth_wrestler_id IS NOT NULL AND youth_wrestler_id = OLD.youth_wrestler_id)
      OR (
        OLD.youth_wrestler_id IS NULL
        AND youth_wrestler_id IS NULL
        AND actor_parent_id IS NOT DISTINCT FROM OLD.parent_id
      )
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS activity_feed_on_participant_unbook_delete ON public.session_participants;
CREATE TRIGGER activity_feed_on_participant_unbook_delete
  AFTER DELETE ON public.session_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_feed_on_participant_unbook();

-- Backfill recent roster bookings so yesterday's sessions appear in the feed
INSERT INTO public.activity_posts (
  trigger_type,
  actor_parent_id,
  youth_wrestler_id,
  coach_id,
  session_id,
  is_public,
  parent_approved,
  created_at
)
SELECT
  'booking_confirmed',
  COALESCE(sp.parent_id, yw.parent_id),
  sp.youth_wrestler_id,
  s.athlete_id,
  sp.session_id,
  COALESCE(yw.profile_public, true),
  true,
  COALESCE(s.created_at, s.scheduled_datetime, now())
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
LEFT JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
WHERE sp.youth_wrestler_id IS NOT NULL
  AND s.scheduled_datetime >= (now() - interval '30 days')
  AND NOT EXISTS (
    SELECT 1
    FROM public.activity_posts ap
    WHERE ap.trigger_type = 'booking_confirmed'
      AND ap.session_id = sp.session_id
      AND ap.youth_wrestler_id = sp.youth_wrestler_id
  );
