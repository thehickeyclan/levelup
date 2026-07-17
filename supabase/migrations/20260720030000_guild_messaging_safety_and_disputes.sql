-- Safety controls, moderation records, and marketplace dispute conversations.

ALTER TABLE public.guild_threads
  DROP CONSTRAINT IF EXISTS guild_threads_thread_type_check;
ALTER TABLE public.guild_threads
  ADD CONSTRAINT guild_threads_thread_type_check CHECK (thread_type IN (
    'listing_qa', 'offer', 'trade', 'order', 'dispute',
    'session', 'coach_inquiry', 'session_change', 'group_session'
  ));

CREATE TABLE IF NOT EXISTS public.guild_message_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.guild_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.guild_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.guild_messages(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN (
    'spam', 'harassment', 'unsafe_contact', 'inappropriate_content',
    'marketplace_dispute', 'other'
  )),
  details text CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guild_message_reports_status_created
  ON public.guild_message_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guild_message_reports_thread
  ON public.guild_message_reports (thread_id, created_at DESC);

ALTER TABLE public.guild_message_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_message_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guild_message_blocks_select ON public.guild_message_blocks;
CREATE POLICY guild_message_blocks_select ON public.guild_message_blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS guild_message_blocks_insert ON public.guild_message_blocks;
CREATE POLICY guild_message_blocks_insert ON public.guild_message_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS guild_message_blocks_delete ON public.guild_message_blocks;
CREATE POLICY guild_message_blocks_delete ON public.guild_message_blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS guild_message_reports_insert ON public.guild_message_reports;
CREATE POLICY guild_message_reports_insert ON public.guild_message_reports
  FOR INSERT TO authenticated WITH CHECK (
    reporter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.guild_threads t
      WHERE t.id = thread_id
        AND (auth.uid() = ANY(t.participant_ids) OR t.is_public = true)
    )
  );
DROP POLICY IF EXISTS guild_message_reports_select ON public.guild_message_reports;
CREATE POLICY guild_message_reports_select ON public.guild_message_reports
  FOR SELECT TO authenticated USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
DROP POLICY IF EXISTS guild_message_reports_admin_update ON public.guild_message_reports;
CREATE POLICY guild_message_reports_admin_update ON public.guild_message_reports
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
