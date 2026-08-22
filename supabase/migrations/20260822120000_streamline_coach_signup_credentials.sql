-- Broaden coach identity options and preserve self-reported credentials during
-- streamlined onboarding. Admin review remains the source of verification.
ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_coach_type_check;

ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_coach_type_check
  CHECK (coach_type IN ('ncaa_athlete', 'former_college_athlete', 'club_hs_coach'));

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS usa_wrestling_certified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.athletes.usa_wrestling_certified IS
  'Coach self-reported USA Wrestling coaching credential; verification is handled separately.';
