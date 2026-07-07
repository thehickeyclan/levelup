-- RAW West — add location for session create / booking / coach map.
-- Run in Supabase Dashboard → SQL Editor.

INSERT INTO public.facilities (name, school, address, latitude, longitude)
SELECT
  'RAW West',
  'RAW',
  '2790 W Mountain St, Kernersville, NC 27284',
  36.1127,
  -80.1633
WHERE NOT EXISTS (
  SELECT 1
  FROM public.facilities AS existing
  WHERE existing.school = 'RAW'
    AND existing.name = 'RAW West'
);

UPDATE public.facilities
SET
  address = '2790 W Mountain St, Kernersville, NC 27284',
  latitude = COALESCE(latitude, 36.1127),
  longitude = COALESCE(longitude, -80.1633),
  updated_at = NOW()
WHERE school = 'RAW'
  AND name = 'RAW West';

-- Verify
SELECT id, name, school, address, latitude, longitude
FROM public.facilities
WHERE school = 'RAW'
  AND name = 'RAW West';
