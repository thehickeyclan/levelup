-- =============================================================================
-- RAW team camp Jul 10–12, 2026 — set $30/athlete on camp sessions
--
-- Sat Jul 11: Liam 10 AM + 4 PM, Cason 10 AM, Ethan Oakley 4 PM (4 sessions)
-- Fri + Sun: Derek + Nick (2 sessions each)
-- Current: 7 coach sessions, 21 athlete spots → $630
-- Full camp: 8 sessions, 24 spots → $720
--
-- Run STEP A, then STEP B, then STEP C.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP A — All camp coach sessions (read-only)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  s.scheduled_datetime,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.status,
  s.current_participants,
  s.max_participants,
  s.price_per_participant,
  a.first_name || ' ' || a.last_name AS coach_name,
  f.name AS facility_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
LEFT JOIN public.facilities f ON f.id = s.facility_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date IN (
  DATE '2026-07-10', DATE '2026-07-11', DATE '2026-07-12'
)
AND (
  (lower(trim(a.first_name)) = 'derek' AND lower(trim(a.last_name)) = 'guanajuato')
  OR (lower(trim(a.first_name)) = 'nick')
  OR (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
  OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
  OR (lower(trim(a.first_name)) = 'ethan' AND lower(trim(a.last_name)) = 'oakley')
)
ORDER BY s.scheduled_datetime, coach_name;

-- Non-camp wrestlers on camp coach sessions (current_participants may include these)
SELECT
  a.first_name || ' ' || a.last_name AS coach_name,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes a ON a.id = s.athlete_id
JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
LEFT JOIN public.users u ON u.id = yw.id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date IN (
  DATE '2026-07-10', DATE '2026-07-11', DATE '2026-07-12'
)
AND (
  lower(trim(a.first_name)) = 'derek'
  OR lower(trim(a.first_name)) = 'nick'
  OR (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
  OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
  OR (lower(trim(a.first_name)) = 'ethan' AND lower(trim(a.last_name)) = 'oakley')
)
AND lower(COALESCE(u.email, '')) NOT IN (
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com'
)
ORDER BY s.scheduled_datetime, coach_name, wrestler_name;

-- Camp wrestler sessions (expect 8 rows when Ethan PM aligned)
SELECT
  s.id AS session_id,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  a.first_name || ' ' || a.last_name AS coach_name,
  count(sp.id)::int AS roster_count,
  s.price_per_participant
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes a ON a.id = s.athlete_id
JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
JOIN public.users u ON u.id = yw.id
WHERE lower(u.email) IN (
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com'
)
AND (timezone('America/New_York', s.scheduled_datetime))::date IN (
  DATE '2026-07-10', DATE '2026-07-11', DATE '2026-07-12'
)
GROUP BY s.id, day_et, time_et, coach_name, s.price_per_participant, s.scheduled_datetime
ORDER BY s.scheduled_datetime, coach_name;

-- -----------------------------------------------------------------------------
-- STEP B — Set $30/athlete on camp sessions (those with roster)
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.sessions AS s
SET
  price_per_participant = 30,
  updated_at = NOW()
WHERE s.id IN (
  SELECT DISTINCT sp.session_id
  FROM public.session_participants sp
  JOIN public.youth_wrestlers yw ON yw.id = sp.youth_wrestler_id
  JOIN public.users u ON u.id = yw.id
  WHERE lower(u.email) IN (
    'southernboy0503@icloud.com',
    'gabrieljager90@gmail.com',
    'skyersjahiem90@gmail.com',
    'glbrewer09@yahoo.com',
    'rahiem.skyers@icloud.com',
    'aidanfinn317@gmail.com'
  )
)
AND (timezone('America/New_York', s.scheduled_datetime))::date IN (
  DATE '2026-07-10', DATE '2026-07-11', DATE '2026-07-12'
);

-- Ethan Oakley Sat 4 PM — camp rate $30 (even before roster alignment)
UPDATE public.sessions AS s
SET
  price_per_participant = 30,
  updated_at = NOW()
FROM public.athletes a
WHERE s.athlete_id = a.id
  AND (timezone('America/New_York', s.scheduled_datetime))::date = DATE '2026-07-11'
  AND lower(trim(a.first_name)) = 'ethan'
  AND lower(trim(a.last_name)) = 'oakley'
  AND extract(hour FROM timezone('America/New_York', s.scheduled_datetime))::int >= 14
  AND s.status <> 'cancelled';

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP C — Verify (expect 8 sessions at $30 when Ethan PM aligned)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  s.status,
  s.current_participants,
  s.price_per_participant,
  a.first_name || ' ' || a.last_name AS coach_name,
  f.name AS facility_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
LEFT JOIN public.facilities f ON f.id = s.facility_id
WHERE (timezone('America/New_York', s.scheduled_datetime))::date IN (
  DATE '2026-07-10', DATE '2026-07-11', DATE '2026-07-12'
)
AND (
  (lower(trim(a.first_name)) = 'derek')
  OR (lower(trim(a.first_name)) = 'nick')
  OR (lower(trim(a.first_name)) = 'liam' AND lower(trim(a.last_name)) = 'hickey')
  OR (lower(trim(a.first_name)) = 'cason' AND lower(trim(a.last_name)) = 'howle')
  OR (lower(trim(a.first_name)) = 'ethan' AND lower(trim(a.last_name)) = 'oakley')
)
AND s.status <> 'cancelled'
ORDER BY s.scheduled_datetime, coach_name;
