-- =============================================================================
-- RAW Saturday 2026-07-11 — Ethan Oakley 4 PM session
--
-- Ethan gets camp wrestlers who are NOT on Liam Hickey 4:00 PM that day.
-- Sets price_per_participant = 30 on Ethan's session.
--
-- Run STEP A (see Liam PM vs Ethan PM split), then STEP B.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP A — Liam 4 PM vs Ethan 4 PM (read-only)
-- -----------------------------------------------------------------------------
SELECT
  'Liam 4 PM' AS slot,
  s.id AS session_id,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
LEFT JOIN public.session_participants sp ON sp.session_id = s.id
LEFT JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
LEFT JOIN public.users u ON u.id = yw.id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND lower(trim(a.first_name)) = 'liam'
  AND lower(trim(a.last_name)) = 'hickey'
  AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
ORDER BY wrestler_name;

SELECT
  s.id AS ethan_session_id,
  s.price_per_participant,
  s.current_participants,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND lower(trim(a.first_name)) = 'ethan'
  AND lower(trim(a.last_name)) = 'oakley'
  AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14;

-- Camp kids who will go to Ethan (not on Liam 4 PM)
SELECT
  u.id AS user_id,
  u.first_name || ' ' || u.last_name AS wrestler_name,
  u.email
FROM public.users u
WHERE lower(u.email) IN (
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com'
)
AND u.id NOT IN (
  SELECT sp.youth_wrestler_id
  FROM public.session_participants sp
  JOIN public.sessions s ON s.id = sp.session_id
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
    AND lower(trim(a.first_name)) = 'liam'
    AND lower(trim(a.last_name)) = 'hickey'
    AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
)
ORDER BY u.email;

-- -----------------------------------------------------------------------------
-- STEP B — Align Ethan PM + set $30 (run BEGIN … COMMIT block only)
-- -----------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  session_day date := DATE '2026-07-11';

  v_liam_pm uuid;
  v_ethan_session uuid;

  v_wrestler uuid;
  v_parent uuid;
  v_fn text;
  v_ln text;

  v_camp_emails text[] := ARRAY[
    'southernboy0503@icloud.com',
    'gabrieljager90@gmail.com',
    'skyersjahiem90@gmail.com',
    'glbrewer09@yahoo.com',
    'rahiem.skyers@icloud.com',
    'aidanfinn317@gmail.com'
  ];
  v_placed int := 0;
BEGIN
  SELECT s.id INTO v_liam_pm
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'liam'
    AND lower(trim(a.last_name)) = 'hickey'
    AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
    AND s.status <> 'cancelled'
  ORDER BY s.scheduled_datetime DESC
  LIMIT 1;

  SELECT s.id INTO v_ethan_session
  FROM public.sessions s
  JOIN public.athletes a ON a.id = s.athlete_id
  WHERE (timezone('America/New_York', s.scheduled_datetime))::date = session_day
    AND lower(trim(a.first_name)) = 'ethan'
    AND lower(trim(a.last_name)) = 'oakley'
    AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
    AND s.status <> 'cancelled'
  ORDER BY s.scheduled_datetime ASC
  LIMIT 1;

  IF v_liam_pm IS NULL THEN
    RAISE EXCEPTION 'No Liam Hickey 4 PM session on %. Align Liam PM roster first.', session_day;
  END IF;
  IF v_ethan_session IS NULL THEN
    RAISE EXCEPTION 'No Ethan Oakley 4 PM session on %. Create session in admin.', session_day;
  END IF;
  IF v_liam_pm = v_ethan_session THEN
    RAISE EXCEPTION 'Liam PM and Ethan PM resolved to the same session id.';
  END IF;

  RAISE NOTICE 'Liam PM %, Ethan PM %', v_liam_pm, v_ethan_session;

  INSERT INTO public.youth_wrestlers (id, first_name, last_name, parent_id, active)
  SELECT
    u.id,
    COALESCE(NULLIF(trim(u.first_name), ''), 'Wrestler'),
    COALESCE(NULLIF(trim(u.last_name), ''), ''),
    NULL,
    true
  FROM public.users u
  WHERE lower(u.email) = ANY (v_camp_emails)
  AND NOT EXISTS (SELECT 1 FROM public.youth_wrestlers yw WHERE yw.id = u.id);

  DELETE FROM public.session_participants sp
  WHERE sp.session_id = v_ethan_session
    AND sp.youth_wrestler_id IN (
      SELECT u.id FROM public.users u WHERE lower(u.email) = ANY (v_camp_emails)
    );

  FOR v_wrestler IN
    SELECT u.id
    FROM public.users u
    WHERE lower(u.email) = ANY (v_camp_emails)
      AND u.id NOT IN (
        SELECT sp.youth_wrestler_id
        FROM public.session_participants sp
        WHERE sp.session_id = v_liam_pm
      )
  LOOP
    SELECT COALESCE(yw.parent_id, yw.id), yw.first_name, yw.last_name
    INTO v_parent, v_fn, v_ln
    FROM public.youth_wrestlers yw
    WHERE yw.id = v_wrestler;

    INSERT INTO public.session_participants (
      session_id, youth_wrestler_id, parent_id, paid, status,
      roster_first_name, roster_last_name
    )
    VALUES (v_ethan_session, v_wrestler, v_parent, false, 'confirmed', v_fn, v_ln)
    ON CONFLICT (session_id, youth_wrestler_id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      roster_first_name = EXCLUDED.roster_first_name,
      roster_last_name = EXCLUDED.roster_last_name,
      status = 'confirmed';

    v_placed := v_placed + 1;
  END LOOP;

  IF v_placed = 0 THEN
    RAISE EXCEPTION 'No camp wrestlers left for Ethan PM — all six are on Liam 4 PM.';
  END IF;

  UPDATE public.sessions AS s
  SET
    price_per_participant = 30,
    current_participants = (
      SELECT count(*)::int FROM public.session_participants sp WHERE sp.session_id = s.id
    ),
    updated_at = NOW()
  WHERE s.id = v_ethan_session;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP C — Verify Ethan PM (camp kids not on Liam 4 PM)
-- -----------------------------------------------------------------------------
SELECT
  a.first_name || ' ' || a.last_name AS coach_name,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.price_per_participant,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email,
  sp.paid
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes a ON a.id = s.athlete_id
JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
LEFT JOIN public.users u ON u.id = yw.id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND lower(trim(a.first_name)) = 'ethan'
  AND lower(trim(a.last_name)) = 'oakley'
ORDER BY wrestler_name;
