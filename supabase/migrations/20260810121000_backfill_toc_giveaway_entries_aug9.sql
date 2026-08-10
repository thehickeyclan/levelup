-- Backfill TOC giveaway eligibility for wrestler accounts created before the
-- tracking table was deployed. Safe to rerun: unique(campaign, user_id) prevents dupes.

INSERT INTO public.toc_giveaway_entries (
  campaign,
  user_id,
  youth_wrestler_id,
  email,
  first_name,
  last_name,
  phone,
  zip_code,
  eligible,
  source,
  created_at
)
SELECT
  'toc_2026',
  u.id,
  y.id,
  u.email,
  COALESCE(y.first_name, u.first_name),
  COALESCE(y.last_name, u.last_name),
  COALESCE(y.phone, u.phone),
  COALESCE(y.zip_code, u.zip_code),
  TRUE,
  'backfill',
  COALESCE(y.created_at, u.created_at, NOW())
FROM public.users u
JOIN public.youth_wrestlers y ON y.id = u.id
WHERE u.role = 'youth_wrestler'
  AND COALESCE(y.created_at, u.created_at) >= TIMESTAMPTZ '2026-08-09 00:00:00-04'
  AND COALESCE(y.created_at, u.created_at) <= TIMESTAMPTZ '2026-09-15 23:59:59-04'
ON CONFLICT (campaign, user_id) DO NOTHING;
