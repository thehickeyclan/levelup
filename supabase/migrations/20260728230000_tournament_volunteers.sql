-- Volunteer signups for the Guild Tournament of Champions.
CREATE TABLE IF NOT EXISTS public.tournament_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  club_or_school TEXT,
  primary_role TEXT NOT NULL,
  additional_roles TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_volunteers_created
  ON public.tournament_volunteers(created_at DESC);

ALTER TABLE public.tournament_volunteers ENABLE ROW LEVEL SECURITY;

-- No public policies: API inserts via service role; admins read via service role.
COMMENT ON TABLE public.tournament_volunteers IS 'Tournament of Champions volunteer signups. Insert via API only.';
