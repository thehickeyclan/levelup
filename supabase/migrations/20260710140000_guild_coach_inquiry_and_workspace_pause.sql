-- Coach inquiry threads need stable lookup keys; pause auto workspace creation.

-- This migration predates the original guild_threads migration in lexical order.
-- Existing databases may already have the table, while clean databases will not.
-- The post-create migration 20260720010000 applies these changes after table creation.
DO $$
BEGIN
  IF to_regclass('public.guild_threads') IS NOT NULL THEN
    ALTER TABLE public.guild_threads
      ADD COLUMN IF NOT EXISTS inquiry_parent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS inquiry_coach_id uuid REFERENCES public.athletes(id) ON DELETE CASCADE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_threads_coach_inquiry_pair
      ON public.guild_threads (inquiry_parent_id, inquiry_coach_id)
      WHERE thread_type = 'coach_inquiry';

    COMMENT ON COLUMN public.guild_threads.inquiry_parent_id IS 'Parent user id for coach_inquiry threads (1:1 parent ↔ coach).';
    COMMENT ON COLUMN public.guild_threads.inquiry_coach_id IS 'Coach athlete user id for coach_inquiry threads.';
  END IF;
END $$;

-- Workspaces are deprecated as a nav surface; stop creating on every booking.
DO $$
BEGIN
  IF to_regclass('public.session_participants') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS create_workspace_on_first_session_trigger ON public.session_participants;
  END IF;
END $$;
