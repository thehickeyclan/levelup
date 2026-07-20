-- One platform-wide revenue split: every coach receives 80% of gross session revenue.
-- Remove legacy/founding-coach overrides and prevent future non-80% values.

ALTER TABLE public.athletes
  ALTER COLUMN payout_rate SET DEFAULT 0.8000;

UPDATE public.athletes
SET payout_rate = 0.8000
WHERE payout_rate IS DISTINCT FROM 0.8000;

UPDATE public.sessions
SET session_payout_rate = 0.8000
WHERE athlete_payout_date IS NULL
  AND session_payout_rate IS DISTINCT FROM 0.8000;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_payout_rate_standard,
  ADD CONSTRAINT athletes_payout_rate_standard
    CHECK (payout_rate IS NULL OR payout_rate = 0.8000);

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_payout_rate_standard,
  ADD CONSTRAINT sessions_payout_rate_standard
    CHECK (session_payout_rate IS NULL OR session_payout_rate = 0.8000)
    NOT VALID;

COMMENT ON COLUMN public.athletes.payout_rate IS
  'Coach revenue share of gross. Platform standard is 0.80 (80%); per-coach overrides are not allowed.';
COMMENT ON COLUMN public.sessions.session_payout_rate IS
  'Coach revenue share snapshotted on the session. Platform standard is 0.80 (80%).';
