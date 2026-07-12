-- Speed up 30-day notification retention purge
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);
