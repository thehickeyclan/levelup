-- =============================================================================
-- School team camp Jul 10–12, 2026 — mark roster paid @ $30/spot
--
-- Invoice: WG-2026-TEAM-0710 ($720)
-- Payment: NC United Store order NC-C31KCQ-XNJL — ARHS Athletic Booster Wrestling
--
-- Six camp wrestlers × 8 sessions = 24 spots @ $30 = $720
--
-- Run STEP A (audit), then STEP B (update), then STEP C (verify).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP A — Current payment state (expect 24 rows, unpaid before STEP B)
-- -----------------------------------------------------------------------------
SELECT
  sp.id AS participant_id,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  coach.first_name || ' ' || coach.last_name AS coach_name,
  yw.first_name || ' ' || yw.last_name AS wrestler_name,
  u.email,
  sp.paid,
  sp.amount_paid,
  sp.payment_method,
  s.price_per_participant
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes coach ON coach.id = s.athlete_id
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
ORDER BY s.scheduled_datetime, coach_name, wrestler_name;

SELECT
  count(*)::int AS spot_count,
  count(*) FILTER (WHERE sp.paid IS TRUE AND sp.amount_paid >= 30)::int AS paid_30_count,
  coalesce(sum(sp.amount_paid) FILTER (WHERE sp.paid IS TRUE), 0)::numeric(10,2) AS paid_total_usd
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
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
);

-- -----------------------------------------------------------------------------
-- STEP B — Mark paid @ $30 (school Stripe link; not per-athlete checkout)
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.session_participants AS sp
SET
  paid = TRUE,
  amount_paid = 30.00,
  payment_method = 'stripe',
  status = 'confirmed'
WHERE sp.id IN (
  SELECT sp2.id
  FROM public.session_participants sp2
  JOIN public.sessions s ON s.id = sp2.session_id
  JOIN public.youth_wrestlers yw ON yw.id = sp2.youth_wrestler_id
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
);

-- Ensure session list price matches camp rate
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

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP C — Verify (expect 24 spots, $720 total)
-- -----------------------------------------------------------------------------
SELECT
  s.id AS session_id,
  (timezone('America/New_York', s.scheduled_datetime))::date AS day_et,
  to_char(timezone('America/New_York', s.scheduled_datetime), 'HH12:MI AM') AS time_et,
  coach.first_name || ' ' || coach.last_name AS coach_name,
  count(sp.id)::int AS roster_count,
  count(sp.id) FILTER (WHERE sp.paid IS TRUE AND sp.amount_paid >= 30)::int AS paid_count,
  (count(sp.id) FILTER (WHERE sp.paid IS TRUE AND sp.amount_paid >= 30) * 30)::int AS session_collected_usd,
  s.price_per_participant
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
JOIN public.athletes coach ON coach.id = s.athlete_id
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

SELECT
  count(*)::int AS spot_count,
  coalesce(sum(sp.amount_paid), 0)::numeric(10,2) AS total_collected_usd
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
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
AND sp.paid IS TRUE;
