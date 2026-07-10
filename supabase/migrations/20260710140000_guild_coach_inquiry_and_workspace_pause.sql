-- Coach inquiry threads need stable lookup keys; pause auto workspace creation.

ALTER TABLE public.guild_threads
  ADD COLUMN IF NOT EXISTS inquiry_parent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS inquiry_coach_id uuid REFERENCES public.athletes(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_threads_coach_inquiry_pair
  ON public.guild_threads (inquiry_parent_id, inquiry_coach_id)
  WHERE thread_type = 'coach_inquiry';

COMMENT ON COLUMN public.guild_threads.inquiry_parent_id IS 'Parent user id for coach_inquiry threads (1:1 parent ↔ coach).';
COMMENT ON COLUMN public.guild_threads.inquiry_coach_id IS 'Coach athlete user id for coach_inquiry threads.';

-- Workspaces are deprecated as a nav surface; stop creating on every booking.
DROP TRIGGER IF EXISTS create_workspace_on_first_session_trigger ON public.session_participants;
