-- Apply coach-inquiry lookup columns after guild_threads exists and harden read receipts.

ALTER TABLE public.guild_threads
  ADD COLUMN IF NOT EXISTS inquiry_parent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS inquiry_coach_id uuid REFERENCES public.athletes(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_threads_coach_inquiry_pair
  ON public.guild_threads (inquiry_parent_id, inquiry_coach_id)
  WHERE thread_type = 'coach_inquiry';

COMMENT ON COLUMN public.guild_threads.inquiry_parent_id IS 'Parent user id for coach_inquiry threads (1:1 parent ↔ coach).';
COMMENT ON COLUMN public.guild_threads.inquiry_coach_id IS 'Coach athlete user id for coach_inquiry threads.';

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guild_threads t
    WHERE t.id = p_thread_id
      AND (
        t.is_public = true
        OR v_user_id = ANY(t.participant_ids)
        OR EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = v_user_id AND u.role = 'admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.guild_messages
  SET read_by = array_append(read_by, v_user_id)
  WHERE thread_id = p_thread_id
    AND NOT (v_user_id = ANY(read_by))
    AND sender_id <> v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_thread_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.mark_thread_read(uuid, uuid);
