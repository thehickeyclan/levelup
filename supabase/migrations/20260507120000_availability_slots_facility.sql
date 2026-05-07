-- Date-specific coach availability rows + optional facility (locks parent booking to one wrestling room).
-- Safe when earlier migrations were skipped: creates `facilities` / `athlete_availability_slots` if missing.

-- FK target when `20240105000000_initial_schema.sql` never ran (Supabase SQL editor / partial migrates).
CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Unknown facility',
  school TEXT NOT NULL DEFAULT '',
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Base table — no legacy UNIQUE here; uniqueness is enforced by partial indexes below.
CREATE TABLE IF NOT EXISTS public.athlete_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.athlete_availability_slots
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.athlete_availability_slots.facility_id IS
  'When set, parent booking that hourly slot must use this facility. NULL = any linked coach facility.';

-- Drop legacy uniqueness from migrations/20240124000000_athlete_availability_dates.sql when present.
ALTER TABLE public.athlete_availability_slots
  DROP CONSTRAINT IF EXISTS athlete_availability_slots_athlete_id_slot_date_start_time_key;

CREATE INDEX IF NOT EXISTS idx_athlete_availability_slots_athlete_date
  ON public.athlete_availability_slots(athlete_id, slot_date);

CREATE UNIQUE INDEX IF NOT EXISTS ux_av_slots_coach_day_start_where_null_facility
  ON public.athlete_availability_slots (athlete_id, slot_date, start_time)
  WHERE facility_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_av_slots_coach_day_start_facility
  ON public.athlete_availability_slots (athlete_id, slot_date, start_time, facility_id)
  WHERE facility_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_athlete_availability_slots_facility_id
  ON public.athlete_availability_slots (facility_id)
  WHERE facility_id IS NOT NULL;

ALTER TABLE public.athlete_availability_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read athlete availability slots" ON public.athlete_availability_slots;
CREATE POLICY "Anyone can read athlete availability slots"
  ON public.athlete_availability_slots FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Athletes can manage own availability slots" ON public.athlete_availability_slots;
CREATE POLICY "Athletes can manage own availability slots"
  ON public.athlete_availability_slots FOR ALL
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());
