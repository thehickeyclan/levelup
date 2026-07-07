-- =============================================================================
-- RAW Saturday 2026-07-11 — align 6 wrestlers to coach groups
--
--   Liam Hickey 10:00 AM (3): Cameron Steiner, Gabriel Jager, Jahiem Skyers
--   Liam Hickey  4:00 PM (3): Cameron Steiner, Gabriel Jager, Jahiem Skyers
--   Cason Howle  10:00 AM (3): Grady Brewer, Rahiem Skyers, Aidan Hamilton
--
-- Same A/B split as Friday; Liam runs morning + afternoon.
-- Run STEP A0, STEP A½ (if Liam 4 PM was cancelled), then STEP B.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP A0 — All Liam/Cason sessions incl. cancelled (read-only)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  s.scheduled_datetime,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.status,
  s.current_participants,
  a.first_name || ' ' || a.last_name AS coach_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND (
    (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
    OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
  )
ORDER BY s.scheduled_datetime, coach_name;

-- -----------------------------------------------------------------------------
-- STEP A — Active sessions only (read-only)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  s.scheduled_datetime,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.session_type,
  s.status,
  s.current_participants,
  s.max_participants,
  a.first_name || ' ' || a.last_name AS coach_name,
  f.name AS facility_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
LEFT JOIN public.facilities f ON f.id = s.facility_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND (
    (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
    OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
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
-- STEP A½ — Restore cancelled Liam 4 PM session (run if STEP B fails on afternoon)
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.sessions AS s
SET
  status = 'scheduled',
  updated_at = NOW()
FROM public.athletes a
WHERE s.athlete_id = a.id
  AND (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND lower(trim(a.first_name)) = 'liam'
  AND lower(trim(a.last_name)) = 'hickey'
  AND s.status = 'cancelled'
  AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14;

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP B — Align rosters (run BEGIN … COMMIT block only)
-- -----------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  session_day date := DATE '2026-07-11';

  v_liam_morning uuid;
  v_liam_afternoon uuid;
  v_cason_session uuid;

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
  v_liam_group uuid[];
  v_morning RECORD;
  v_invite text;
BEGIN
  SELECT s.id INTO v_liam_morning
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'liam'
    AND lower(trim(a.last_name)) = 'hickey'
    AND s.status <> 'cancelled'
    AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int < 14
  ORDER BY s.scheduled_datetime ASC
  LIMIT 1;

  SELECT s.id INTO v_liam_afternoon
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'liam'
    AND lower(trim(a.last_name)) = 'hickey'
    AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
  ORDER BY
    CASE WHEN s.status <> 'cancelled' THEN 0 ELSE 1 END,
    s.scheduled_datetime DESC
  LIMIT 1;

  IF v_liam_afternoon IS NOT NULL THEN
    UPDATE public.sessions
    SET status = 'scheduled', updated_at = NOW()
    WHERE id = v_liam_afternoon AND status = 'cancelled';
  END IF;

  -- Clone 4 PM from morning template if afternoon row was deleted entirely
  IF v_liam_morning IS NOT NULL AND v_liam_afternoon IS NULL THEN
    SELECT
      s.parent_id,
      s.athlete_id,
      s.facility_id,
      s.session_type,
      s.session_mode,
      s.focus_area,
      s.join_policy,
      s.max_participants,
      s.base_price,
      s.price_per_participant,
      s.product_id,
      s.athlete_service_id,
      s.duration_minutes
    INTO v_morning
    FROM public.sessions s
    WHERE s.id = v_liam_morning;

    LOOP
      v_invite := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.sessions x WHERE x.partner_invite_code = v_invite
      );
    END LOOP;

    INSERT INTO public.sessions (
      parent_id,
      athlete_id,
      facility_id,
      session_type,
      session_mode,
      focus_area,
      join_policy,
      partner_invite_code,
      max_participants,
      current_participants,
      base_price,
      price_per_participant,
      product_id,
      athlete_service_id,
      scheduled_datetime,
      duration_minutes,
      total_price,
      athlete_payment,
      org_fee,
      stripe_fee,
      paid_with_credit,
      status,
      athlete_paid
    ) VALUES (
      v_morning.parent_id,
      v_morning.athlete_id,
      v_morning.facility_id,
      COALESCE(v_morning.session_type, 'group'),
      COALESCE(v_morning.session_mode, 'partner-invite'),
      v_morning.focus_area,
      COALESCE(v_morning.join_policy, 'public'),
      v_invite,
      COALESCE(v_morning.max_participants, 6),
      0,
      v_morning.base_price,
      COALESCE(v_morning.price_per_participant, 30),
      v_morning.product_id,
      v_morning.athlete_service_id,
      (session_day::text || ' 16:00:00')::timestamp AT TIME ZONE 'America/New_York',
      COALESCE(v_morning.duration_minutes, 60),
      0,
      0,
      0,
      0,
      false,
      'scheduled',
      false
    )
    RETURNING id INTO v_liam_afternoon;

    RAISE NOTICE 'Created Liam afternoon session %', v_liam_afternoon;
  END IF;

  SELECT s.id INTO v_cason_session
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'cason'
    AND lower(trim(a.last_name)) = 'howle'
    AND s.status <> 'cancelled'
  ORDER BY s.scheduled_datetime ASC
  LIMIT 1;

  IF v_liam_morning IS NULL THEN
    RAISE EXCEPTION 'No Liam Hickey morning session on %. Run STEP A — create 10 AM session or fix date.', session_day;
  END IF;
  IF v_liam_afternoon IS NULL THEN
    RAISE EXCEPTION 'No Liam Hickey afternoon session on %. Run STEP A — create 4 PM session or fix date.', session_day;
  END IF;
  IF v_cason_session IS NULL THEN
    RAISE EXCEPTION 'No Cason session on %. Run STEP A — create session or fix date.', session_day;
  END IF;
  IF v_liam_morning = v_liam_afternoon OR v_liam_morning = v_cason_session OR v_liam_afternoon = v_cason_session THEN
    RAISE EXCEPTION 'Liam morning, Liam afternoon, and Cason must be three distinct session ids.';
  END IF;

  RAISE NOTICE 'Liam AM %, Liam PM %, Cason %', v_liam_morning, v_liam_afternoon, v_cason_session;

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
  v_liam_group := ARRAY[v_cam, v_gabriel, v_jahiem];

  DELETE FROM public.session_participants sp
  USING public.sessions s, public.athletes a
  WHERE sp.session_id = s.id
    AND s.athlete_id = a.id
    AND (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND (
      (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
      OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
    )
    AND sp.youth_wrestler_id = ANY (v_all);

  -- Liam morning + afternoon (Group A, 3 each)
  FOREACH v_wrestler IN ARRAY v_liam_group LOOP
    SELECT COALESCE(yw.parent_id, yw.id), yw.first_name, yw.last_name
    INTO v_parent, v_fn, v_ln
    FROM public.youth_wrestlers yw
    WHERE yw.id = v_wrestler;

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_liam_morning, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
    ON CONFLICT (session_id, youth_wrestler_id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      roster_first_name = EXCLUDED.roster_first_name,
      roster_last_name = EXCLUDED.roster_last_name,
      status = 'confirmed';

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_liam_afternoon, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
    ON CONFLICT (session_id, youth_wrestler_id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      roster_first_name = EXCLUDED.roster_first_name,
      roster_last_name = EXCLUDED.roster_last_name,
      status = 'confirmed';
  END LOOP;

  -- Cason morning (Group B, 3)
  FOREACH v_wrestler IN ARRAY ARRAY[v_grady, v_rahiem, v_aidan] LOOP
    SELECT COALESCE(yw.parent_id, yw.id), yw.first_name, yw.last_name
    INTO v_parent, v_fn, v_ln
    FROM public.youth_wrestlers yw
    WHERE yw.id = v_wrestler;

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_cason_session, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
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
  WHERE s.id IN (v_liam_morning, v_liam_afternoon, v_cason_session);
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP C — Verify (expect Liam 3 + Liam 3 + Cason 3 = 9 rows)
-- -----------------------------------------------------------------------------
SELECT
  a.first_name || ' ' || a.last_name AS coach_name,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.scheduled_datetime,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email,
  sp.paid
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes a ON a.id = s.athlete_id
JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
LEFT JOIN public.users u ON u.id = yw.id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND (
    (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
    OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
  )
ORDER BY s.scheduled_datetime, coach_name, wrestler_name;
