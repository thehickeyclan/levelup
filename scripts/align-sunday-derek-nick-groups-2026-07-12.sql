-- =============================================================================
-- RAW Sunday 2026-07-12 — align 6 wrestlers to coach groups
--
--   Derek Guanajuato (3): Cameron Steiner, Gabriel Jager, Jahiem Skyers
--   Nick O'Neill     (3): Grady Brewer, Rahiem Skyers, Aidan Hamilton
--
-- Same split as Friday. Run STEP A0 + STEP A first, then STEP B.
-- Coach match uses first name (like Friday) — avoids O'Neill apostrophe variants.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP A0 — All sessions on Sunday (if STEP B fails, check Nick exists here)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  s.scheduled_datetime,
  s.status,
  a.first_name || ' ' || a.last_name AS coach_name,
  a.last_name AS coach_last_raw
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-12'
  AND s.status <> 'cancelled'
ORDER BY s.scheduled_datetime, coach_name;

-- -----------------------------------------------------------------------------
-- STEP A — Derek / Nick sessions on Sunday
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  s.scheduled_datetime,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  s.session_type,
  s.status,
  s.current_participants,
  s.max_participants,
  a.first_name || ' ' || a.last_name AS coach_name,
  f.name AS facility_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
LEFT JOIN public.facilities f ON f.id = s.facility_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-12'
  AND (
    lower(trim(a.first_name)) = 'derek'
    OR lower(trim(a.first_name)) = 'nick'
  )
ORDER BY s.scheduled_datetime, coach_name;

SELECT
  u.id AS user_id,
  u.email,
  u.first_name,
  u.last_name,
  yw.id AS youth_wrestler_id
FROM public.users u
LEFT JOIN public.youth_wrestlers yw ON yw.id = u.id
WHERE lower(u.email) IN (
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com'
)
ORDER BY u.email;

-- -----------------------------------------------------------------------------
-- STEP B — Align rosters (run BEGIN … COMMIT block only)
-- -----------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  session_day date := DATE '2026-07-12';

  v_derek_session uuid;
  v_nick_session uuid;

  v_cam uuid;
  v_gabriel uuid;
  v_jahiem uuid;
  v_grady uuid;
  v_rahiem uuid;
  v_aidan uuid;

  v_wrestler uuid;
  v_parent uuid;
  v_fn text;
  v_ln text;

  v_all uuid[];
BEGIN
  SELECT s.id INTO v_derek_session
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'derek'
    AND s.status <> 'cancelled'
  ORDER BY s.scheduled_datetime
  LIMIT 1;

  SELECT s.id INTO v_nick_session
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'nick'
    AND s.status <> 'cancelled'
  ORDER BY s.scheduled_datetime
  LIMIT 1;

  IF v_derek_session IS NULL THEN
    RAISE EXCEPTION 'No Derek session on %. Run STEP A0 — create session or fix date.', session_day;
  END IF;
  IF v_nick_session IS NULL THEN
    RAISE EXCEPTION 'No Nick session on %. Run STEP A0 — Nick needs a Sunday session on the calendar before STEP B.', session_day;
  END IF;
  IF v_derek_session = v_nick_session THEN
    RAISE EXCEPTION 'Derek and Nick resolved to the same session id.';
  END IF;

  RAISE NOTICE 'Derek session %, Nick session %', v_derek_session, v_nick_session;

  INSERT INTO public.youth_wrestlers (id, first_name, last_name, parent_id, active)
  SELECT
    u.id,
    COALESCE(NULLIF(trim(u.first_name), ''), 'Wrestler'),
    COALESCE(NULLIF(trim(u.last_name), ''), ''),
    NULL,
    true
  FROM public.users u
  WHERE lower(u.email) IN (
    'southernboy0503@icloud.com',
    'gabrieljager90@gmail.com',
    'skyersjahiem90@gmail.com',
    'glbrewer09@yahoo.com',
    'rahiem.skyers@icloud.com',
    'aidanfinn317@gmail.com'
  )
  AND NOT EXISTS (SELECT 1 FROM public.youth_wrestlers yw WHERE yw.id = u.id);

  SELECT u.id INTO v_cam FROM public.users u WHERE lower(u.email) = 'southernboy0503@icloud.com';
  SELECT u.id INTO v_gabriel FROM public.users u WHERE lower(u.email) = 'gabrieljager90@gmail.com';
  SELECT u.id INTO v_jahiem FROM public.users u WHERE lower(u.email) = 'skyersjahiem90@gmail.com';
  SELECT u.id INTO v_grady FROM public.users u WHERE lower(u.email) = 'glbrewer09@yahoo.com';
  SELECT u.id INTO v_rahiem FROM public.users u WHERE lower(u.email) = 'rahiem.skyers@icloud.com';
  SELECT u.id INTO v_aidan FROM public.users u WHERE lower(u.email) = 'aidanfinn317@gmail.com';

  IF v_cam IS NULL OR v_gabriel IS NULL OR v_jahiem IS NULL
     OR v_grady IS NULL OR v_rahiem IS NULL OR v_aidan IS NULL THEN
    RAISE EXCEPTION 'Missing user for one of the six emails.';
  END IF;

  v_all := ARRAY[v_cam, v_gabriel, v_jahiem, v_grady, v_rahiem, v_aidan];

  DELETE FROM public.session_participants sp
  USING public.sessions s, public.athletes a
  WHERE sp.session_id = s.id
    AND s.athlete_id = a.id
    AND (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND (
      lower(trim(a.first_name)) = 'derek'
      OR lower(trim(a.first_name)) = 'nick'
    )
    AND sp.youth_wrestler_id = ANY (v_all);

  FOREACH v_wrestler IN ARRAY ARRAY[v_cam, v_gabriel, v_jahiem] LOOP
    SELECT COALESCE(yw.parent_id, yw.id), yw.first_name, yw.last_name
    INTO v_parent, v_fn, v_ln
    FROM public.youth_wrestlers yw
    WHERE yw.id = v_wrestler;

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_derek_session, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
    ON CONFLICT (session_id, youth_wrestler_id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      roster_first_name = EXCLUDED.roster_first_name,
      roster_last_name = EXCLUDED.roster_last_name,
      status = 'confirmed';
  END LOOP;

  FOREACH v_wrestler IN ARRAY ARRAY[v_grady, v_rahiem, v_aidan] LOOP
    SELECT COALESCE(yw.parent_id, yw.id), yw.first_name, yw.last_name
    INTO v_parent, v_fn, v_ln
    FROM public.youth_wrestlers yw
    WHERE yw.id = v_wrestler;

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_nick_session, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
    ON CONFLICT (session_id, youth_wrestler_id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      roster_first_name = EXCLUDED.roster_first_name,
      roster_last_name = EXCLUDED.roster_last_name,
      status = 'confirmed';
  END LOOP;

  UPDATE public.sessions AS s
  SET
    current_participants = (
      SELECT count(*)::int FROM public.session_participants sp WHERE sp.session_id = s.id
    ),
    updated_at = NOW()
  WHERE s.id IN (v_derek_session, v_nick_session);
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP C — Verify (expect 3 per coach)
-- -----------------------------------------------------------------------------
SELECT
  a.first_name || ' ' || a.last_name AS coach_name,
  s.scheduled_datetime,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email,
  sp.paid
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes a ON a.id = s.athlete_id
JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
LEFT JOIN public.users u ON u.id = yw.id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-12'
  AND (
    lower(trim(a.first_name)) = 'derek'
    OR lower(trim(a.first_name)) = 'nick'
  )
ORDER BY coach_name, wrestler_name;
