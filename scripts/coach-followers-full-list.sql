-- =============================================================================
-- Full list: which parents follow which coaches
-- Run in Supabase SQL Editor (postgres / service role bypasses RLS).
-- =============================================================================

-- One row per follow (coach + parent), newest follows first within each coach
SELECT
  a.id AS coach_id,
  trim(concat_ws(' ', a.first_name, a.last_name)) AS coach_name,
  a.school AS coach_school,
  cf.created_at AS followed_at,
  p.id AS parent_id,
  trim(concat_ws(' ', p.first_name, p.last_name)) AS parent_name,
  p.email AS parent_email,
  p.phone AS parent_phone,
  CASE
    WHEN p.phone IS NOT NULL AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10 THEN true
    ELSE false
  END AS parent_has_sms_phone,
  COALESCE((p.notification_preferences->>'new_sessions_sms')::boolean, true) AS new_sessions_sms_on,
  COALESCE((p.notification_preferences->>'sms_opted_out')::boolean, false) AS sms_opted_out
FROM public.coach_follows cf
JOIN public.athletes a ON a.id = cf.coach_id
JOIN public.users p ON p.id = cf.parent_id
ORDER BY
  coach_name,
  cf.created_at DESC;

-- -----------------------------------------------------------------------------
-- Summary: follower count per coach
-- -----------------------------------------------------------------------------
SELECT
  a.id AS coach_id,
  trim(concat_ws(' ', a.first_name, a.last_name)) AS coach_name,
  a.school AS coach_school,
  count(*) AS follower_count,
  count(*) FILTER (
    WHERE p.phone IS NOT NULL AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
  ) AS followers_with_phone,
  count(*) FILTER (
    WHERE COALESCE((p.notification_preferences->>'new_sessions_sms')::boolean, true)
      AND NOT COALESCE((p.notification_preferences->>'sms_opted_out')::boolean, false)
      AND p.phone IS NOT NULL
      AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
  ) AS followers_eligible_for_session_sms
FROM public.coach_follows cf
JOIN public.athletes a ON a.id = cf.coach_id
JOIN public.users p ON p.id = cf.parent_id
GROUP BY a.id, a.first_name, a.last_name, a.school
ORDER BY follower_count DESC, coach_name;

-- -----------------------------------------------------------------------------
-- Optional: single coach by name (uncomment and edit)
-- -----------------------------------------------------------------------------
-- SELECT *
-- FROM (
--   SELECT
--     trim(concat_ws(' ', a.first_name, a.last_name)) AS coach_name,
--     cf.created_at AS followed_at,
--     trim(concat_ws(' ', p.first_name, p.last_name)) AS parent_name,
--     p.email AS parent_email,
--     p.phone AS parent_phone
--   FROM public.coach_follows cf
--   JOIN public.athletes a ON a.id = cf.coach_id
--   JOIN public.users p ON p.id = cf.parent_id
-- ) sub
-- WHERE coach_name ILIKE '%Simcox%'
-- ORDER BY followed_at DESC;
