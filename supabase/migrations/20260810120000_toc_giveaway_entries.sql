-- Tournament of Champions x Wrestling Guild $100 training-credit giveaway
-- Tracks eligible wrestler signups and lets admins select/credit winners.

CREATE TABLE IF NOT EXISTS public.toc_giveaway_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign TEXT NOT NULL DEFAULT 'toc_2026',
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  youth_wrestler_id UUID REFERENCES public.youth_wrestlers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  zip_code TEXT,
  eligible BOOLEAN NOT NULL DEFAULT TRUE,
  winner BOOLEAN NOT NULL DEFAULT FALSE,
  credit_granted BOOLEAN NOT NULL DEFAULT FALSE,
  credit_id UUID REFERENCES public.credits(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'signup',
  selected_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign, user_id)
);

CREATE INDEX IF NOT EXISTS idx_toc_giveaway_entries_campaign_created
  ON public.toc_giveaway_entries(campaign, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_toc_giveaway_entries_winner
  ON public.toc_giveaway_entries(campaign, winner, credit_granted);

DROP TRIGGER IF EXISTS update_toc_giveaway_entries_updated_at ON public.toc_giveaway_entries;
CREATE TRIGGER update_toc_giveaway_entries_updated_at
  BEFORE UPDATE ON public.toc_giveaway_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.toc_giveaway_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage toc giveaway entries" ON public.toc_giveaway_entries;
CREATE POLICY "Admins can manage toc giveaway entries"
  ON public.toc_giveaway_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role full access to toc giveaway entries" ON public.toc_giveaway_entries;
CREATE POLICY "Service role full access to toc giveaway entries"
  ON public.toc_giveaway_entries FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.toc_giveaway_entries IS
  'Tournament of Champions 2026 Guild training-credit giveaway eligibility, winner, and credit status.';
