-- Colton Palmer — correct coach payout $148 → $144 for 2026-07-05 session(s).
-- Run in Supabase Dashboard → SQL Editor.
--
-- Targets sessions where:
--   • coach is Colton Palmer
--   • athlete_payment is currently 148
--   • session is on 2026-07-05 (US/Eastern calendar day) OR payout was recorded that day

-- 1) Preview rows that will change
SELECT
  s.id,
  s.scheduled_datetime,
  (s.scheduled_datetime AT TIME ZONE 'America/New_York')::date AS session_date_et,
  s.status,
  s.athlete_payment,
  s.athlete_payout_date,
  a.first_name,
  a.last_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
WHERE a.first_name ILIKE 'Colton'
  AND a.last_name ILIKE 'Palmer'
  AND s.athlete_payment = 148
  AND (
    (s.scheduled_datetime AT TIME ZONE 'America/New_York')::date = DATE '2026-07-05'
    OR s.athlete_payout_date = DATE '2026-07-05'
  );

-- 2) Apply fix
UPDATE public.sessions s
SET
  athlete_payment = 144,
  updated_at = NOW()
FROM public.athletes a
WHERE s.athlete_id = a.id
  AND a.first_name ILIKE 'Colton'
  AND a.last_name ILIKE 'Palmer'
  AND s.athlete_payment = 148
  AND (
    (s.scheduled_datetime AT TIME ZONE 'America/New_York')::date = DATE '2026-07-05'
    OR s.athlete_payout_date = DATE '2026-07-05'
  );

-- 3) Verify
SELECT
  s.id,
  s.scheduled_datetime,
  s.status,
  s.athlete_payment,
  s.athlete_payout_date,
  a.first_name,
  a.last_name
FROM public.sessions s
JOIN public.athletes a ON a.id = s.athlete_id
WHERE a.first_name ILIKE 'Colton'
  AND a.last_name ILIKE 'Palmer'
  AND (
    (s.scheduled_datetime AT TIME ZONE 'America/New_York')::date = DATE '2026-07-05'
    OR s.athlete_payout_date = DATE '2026-07-05'
  )
ORDER BY s.scheduled_datetime;
