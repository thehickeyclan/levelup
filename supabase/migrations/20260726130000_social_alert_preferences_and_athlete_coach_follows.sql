-- Allow youth-wrestler accounts to follow coaches. The existing parent_id column
-- stores the authenticated follower account for historical compatibility.
DROP POLICY IF EXISTS "Parents can manage own follows" ON public.coach_follows;
DROP POLICY IF EXISTS "Families can manage own coach follows" ON public.coach_follows;

CREATE POLICY "Families can manage own coach follows"
  ON public.coach_follows FOR ALL
  TO authenticated
  USING (
    parent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('parent', 'youth_wrestler', 'admin')
    )
  )
  WITH CHECK (
    parent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('parent', 'youth_wrestler', 'admin')
    )
  );

-- Preferences live in users.notification_preferences JSONB, so this is
-- backward-compatible and does not require new table columns.
UPDATE public.users
SET notification_preferences =
  COALESCE(notification_preferences, '{}'::jsonb)
  || jsonb_build_object(
    'followed_coaches_push', COALESCE((notification_preferences->>'followed_coaches_push')::boolean, true),
    'training_partner_activity_push', COALESCE((notification_preferences->>'training_partner_activity_push')::boolean, false),
    'matching_sessions_push', COALESCE((notification_preferences->>'matching_sessions_push')::boolean, true),
    'market_watch_push', COALESCE((notification_preferences->>'market_watch_push')::boolean, true)
  );
