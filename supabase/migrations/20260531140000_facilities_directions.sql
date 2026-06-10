-- Special instructions for a facility (parking, room number, travel notes).
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS directions TEXT;

COMMENT ON COLUMN public.facilities.directions IS 'Optional arrival notes shown to parents (parking, entrance, mat room).';
