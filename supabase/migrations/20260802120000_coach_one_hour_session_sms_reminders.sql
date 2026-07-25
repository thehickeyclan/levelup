ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS coach_one_hour_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.sessions.coach_one_hour_reminder_sent_at IS
  'Set when the assigned coach SMS reminder is claimed/sent roughly one hour before this session.';

CREATE INDEX IF NOT EXISTS idx_sessions_coach_one_hour_reminder_due
  ON public.sessions (scheduled_datetime)
  WHERE status = 'scheduled' AND coach_one_hour_reminder_sent_at IS NULL;
