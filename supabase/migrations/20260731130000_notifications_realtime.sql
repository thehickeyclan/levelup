-- Live notification badge / inbox for Guild iPhone app
-- SELECT RLS already exists: "Notifications: user sees own"
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
