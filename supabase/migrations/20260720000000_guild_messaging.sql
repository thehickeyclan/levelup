-- Guild-wide messaging: threads tied to transactions (Market Phase 1, coaching schema ready).

CREATE TABLE IF NOT EXISTS public.guild_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_type text NOT NULL CHECK (thread_type IN (
    'listing_qa',
    'offer',
    'trade',
    'order',
    'session',
    'coach_inquiry',
    'session_change',
    'group_session'
  )),
  listing_id uuid REFERENCES public.market_listings(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.market_offers(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.market_trades(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.market_orders(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guild_threads_listing ON public.guild_threads (listing_id);
CREATE INDEX IF NOT EXISTS idx_guild_threads_offer ON public.guild_threads (offer_id);
CREATE INDEX IF NOT EXISTS idx_guild_threads_trade ON public.guild_threads (trade_id);
CREATE INDEX IF NOT EXISTS idx_guild_threads_order ON public.guild_threads (order_id);
CREATE INDEX IF NOT EXISTS idx_guild_threads_session ON public.guild_threads (session_id);
CREATE INDEX IF NOT EXISTS idx_guild_threads_type ON public.guild_threads (thread_type);
CREATE INDEX IF NOT EXISTS idx_guild_threads_participants ON public.guild_threads USING gin (participant_ids);

CREATE TABLE IF NOT EXISTS public.guild_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.guild_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (char_length(body) <= 1000),
  read_by uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guild_messages_thread_created ON public.guild_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guild_messages_read_by ON public.guild_messages USING gin (read_by);

CREATE OR REPLACE FUNCTION public.mark_thread_read(
  p_thread_id uuid,
  p_user_id uuid
) RETURNS void AS $$
  UPDATE public.guild_messages
  SET read_by = array_append(read_by, p_user_id)
  WHERE thread_id = p_thread_id
    AND NOT (p_user_id = ANY(read_by))
    AND sender_id != p_user_id;
$$ LANGUAGE sql SECURITY DEFINER;

ALTER TABLE public.guild_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guild_threads_select ON public.guild_threads;
CREATE POLICY guild_threads_select ON public.guild_threads FOR SELECT
  USING (
    is_public = true
    OR auth.uid() = ANY(participant_ids)
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS guild_threads_insert ON public.guild_threads;
CREATE POLICY guild_threads_insert ON public.guild_threads FOR INSERT
  WITH CHECK (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS guild_messages_select ON public.guild_messages;
CREATE POLICY guild_messages_select ON public.guild_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.guild_threads t
      WHERE t.id = thread_id
        AND (
          t.is_public = true
          OR auth.uid() = ANY(t.participant_ids)
          OR EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

DROP POLICY IF EXISTS guild_messages_insert ON public.guild_messages;
CREATE POLICY guild_messages_insert ON public.guild_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.guild_threads t
      WHERE t.id = thread_id
        AND (
          t.is_public = true
          OR auth.uid() = ANY(t.participant_ids)
        )
    )
  );

-- Realtime: Supabase Dashboard → Database → Replication → add guild_messages to supabase_realtime
-- (or run: ALTER PUBLICATION supabase_realtime ADD TABLE public.guild_messages;)
