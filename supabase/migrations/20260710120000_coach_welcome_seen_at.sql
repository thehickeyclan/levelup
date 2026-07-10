-- One-time post-approval welcome screen (activation funnel).
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS coach_welcome_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.athletes.coach_welcome_seen_at IS 'When the coach dismissed the post-approval welcome / launch checklist.';

-- Existing active coaches should not see the welcome screen retroactively.
UPDATE public.athletes
SET coach_welcome_seen_at = COALESCE(coach_welcome_seen_at, NOW())
WHERE status = 'active';
