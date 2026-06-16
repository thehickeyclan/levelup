-- =============================================================================
-- Diagnose why a Guild login fails ("Invalid login credentials")
-- Run in Supabase SQL Editor. Replace YOUR_EMAIL below on both queries.
-- =============================================================================

-- App profile (public.users)
SELECT
  id,
  email,
  role,
  first_name,
  last_name,
  archived_at,
  last_login_at,
  created_at
FROM public.users
WHERE lower(email) = lower('YOUR_EMAIL@example.com');

-- Auth account (auth.users) — must exist for login to work
SELECT
  id,
  email,
  email_confirmed_at,
  last_sign_in_at,
  created_at,
  banned_until,
  deleted_at
FROM auth.users
WHERE lower(email) = lower('YOUR_EMAIL@example.com');

-- -----------------------------------------------------------------------------
-- How to read results
-- -----------------------------------------------------------------------------
-- • NO auth.users row → "Invalid login credentials" forever until auth account exists.
--   Fix: Forgot password won't work. Use Supabase Auth → Add user, or have them Sign up.
-- • auth row exists, wrong password → Forgot password on /forgot-password (check spam).
-- • email_confirmed_at IS NULL → confirm in Supabase or turn off email confirmation.
-- • public.users missing but auth exists → login fails with "User profile not found" (different error).
-- • archived_at set → does NOT block login (app flag only).

-- After they can sign in, grant admin if needed:
-- UPDATE public.users SET role = 'admin' WHERE lower(email) = lower('YOUR_EMAIL@example.com');
