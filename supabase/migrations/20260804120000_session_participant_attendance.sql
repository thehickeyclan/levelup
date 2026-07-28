-- Per-athlete attendance recorded when a coach closes a completed session.
-- NULL preserves historical registrations whose attendance was never verified.

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT
    CHECK (attendance_status IN ('attended', 'no_show')),
  ADD COLUMN IF NOT EXISTS attendance_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_recorded_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_participants_attendance
  ON public.session_participants(session_id, attendance_status);

COMMENT ON COLUMN public.session_participants.attendance_status IS
  'Coach-verified closeout status: attended or no_show. NULL means attendance was not recorded.';
