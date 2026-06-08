-- Parents completing payment after a session is marked complete still need to load the register page/API.
DROP POLICY IF EXISTS "Authenticated can read sessions open for registration" ON public.sessions;

CREATE POLICY "Authenticated can read sessions open for registration"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (
    join_policy IN ('public', 'invite_only')
    AND status IN ('scheduled', 'completed')
  );

COMMENT ON POLICY "Authenticated can read sessions open for registration" ON public.sessions IS
  'Parents can load register/checkout for public or invite_only sessions that are scheduled or completed (late payment).';
