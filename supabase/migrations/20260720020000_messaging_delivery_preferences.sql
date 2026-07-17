-- Add explicit messaging delivery choices to existing notification preference JSON.

UPDATE public.users
SET notification_preferences =
  COALESCE(notification_preferences, '{}'::jsonb)
  || jsonb_build_object(
    'messaging_sms', COALESCE((notification_preferences->>'messaging_sms')::boolean, true),
    'messaging_push', COALESCE((notification_preferences->>'messaging_push')::boolean, true)
  );

ALTER TABLE public.users
  ALTER COLUMN notification_preferences SET DEFAULT '{
    "new_sessions_sms": true,
    "reminders_sms": true,
    "confirmations_sms": true,
    "new_sessions_push": true,
    "reminders_push": true,
    "confirmations_push": true,
    "messaging_sms": true,
    "messaging_push": true,
    "sms_opted_out": false
  }'::jsonb;

COMMENT ON COLUMN public.users.notification_preferences IS
  'User delivery toggles for sessions, bookings, and messaging across SMS and push; sms_opted_out is the global carrier-compliance stop flag.';
