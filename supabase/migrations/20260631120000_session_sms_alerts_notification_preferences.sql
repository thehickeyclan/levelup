-- Parent notification preferences (SMS + push toggles) and idempotent session SMS alert log.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
    "new_sessions_sms": true,
    "reminders_sms": true,
    "confirmations_sms": true,
    "new_sessions_push": true,
    "reminders_push": true,
    "confirmations_push": true,
    "sms_opted_out": false
  }'::jsonb;

COMMENT ON COLUMN public.users.notification_preferences IS
  'Parent notification toggles: new_sessions_sms, reminders_sms, confirmations_sms, new_sessions_push, reminders_push, confirmations_push, sms_opted_out.';

CREATE TABLE IF NOT EXISTS public.session_sms_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_session_sms_alerts_session ON public.session_sms_alerts(session_id);

COMMENT ON TABLE public.session_sms_alerts IS
  'One row per parent per session — prevents duplicate follower SMS when publish triggers fire twice.';

ALTER TABLE public.session_sms_alerts ENABLE ROW LEVEL SECURITY;
