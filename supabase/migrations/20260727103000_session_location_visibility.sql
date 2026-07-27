-- Private sessions may hide the exact address until a family is registered.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS location_visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_location_visibility_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_location_visibility_check
  CHECK (location_visibility IN ('public', 'participants_only'));

COMMENT ON COLUMN public.sessions.location_visibility IS
  'public shows the facility address to signed-in users; participants_only reveals it only to the coach, admins, and registered families.';
