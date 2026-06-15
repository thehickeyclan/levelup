-- =============================================================================
-- Create a youth wrestler and attach to a parent (primary parent_id).
-- Run in Supabase SQL Editor (postgres role bypasses RLS).
--
-- Parent must exist in public.users (signed in at least once).
-- phone + zip_code are required by the app for booking/texts/maps.
-- =============================================================================

DO $$
DECLARE
  -- Resolved from public.users (jpbernthal@gmail.com)
  v_parent_id UUID := '0637abd0-b96d-45d8-b2b1-47baff7cfea7';
  v_parent_email TEXT := 'jpbernthal@gmail.com';

  v_first TEXT := 'Zareion';
  v_last TEXT := 'Berger';
  v_weight_class TEXT := '142';
  v_school TEXT := 'New Bern HS';
  v_graduation_year INT := NULL;  -- set e.g. 2027 if known
  v_date_of_birth DATE := NULL;   -- set e.g. '2010-03-15' if known

  -- REQUIRED — fill before run (kid cell + home ZIP)
  v_phone TEXT := '';
  v_zip TEXT := '';

  v_kid_id UUID;
  v_existing INT;
  v_parent_check UUID;
BEGIN
  IF v_phone IS NULL OR trim(v_phone) = '' THEN
    RAISE EXCEPTION 'Set v_phone to the athlete''s cell (10+ digits) before running.';
  END IF;
  IF v_zip IS NULL OR trim(v_zip) = '' THEN
    RAISE EXCEPTION 'Set v_zip to the athlete''s home ZIP (5 digits or ZIP+4) before running.';
  END IF;

  SELECT u.id
  INTO v_parent_check
  FROM public.users u
  WHERE u.id = v_parent_id
    AND lower(trim(u.email)) = lower(trim(v_parent_email));

  IF v_parent_check IS NULL THEN
    RAISE EXCEPTION 'Parent id % does not match email %. Re-run the users lookup.', v_parent_id, v_parent_email;
  END IF;

  SELECT count(*)::INT
  INTO v_existing
  FROM public.youth_wrestlers y
  WHERE y.parent_id = v_parent_id
    AND lower(trim(y.first_name)) = lower(trim(v_first))
    AND lower(trim(y.last_name)) = lower(trim(v_last));

  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Kid already exists for this parent: % % (count=%). Use link-parent script instead.',
      v_first, v_last, v_existing;
  END IF;

  INSERT INTO public.youth_wrestlers (
    parent_id,
    first_name,
    last_name,
    weight_class,
    school,
    graduation_year,
    date_of_birth,
    phone,
    zip_code,
    active
  ) VALUES (
    v_parent_id,
    trim(v_first),
    trim(v_last),
    NULLIF(trim(v_weight_class), ''),
    NULLIF(trim(v_school), ''),
    v_graduation_year,
    v_date_of_birth,
    regexp_replace(trim(v_phone), '\D', '', 'g'),
    trim(v_zip),
    true
  )
  RETURNING id INTO v_kid_id;

  RAISE NOTICE 'Created % % (id=%) — parent % (%)',
    v_first, v_last, v_kid_id, v_parent_id, v_parent_email;
END $$;

-- Verify:
-- SELECT y.id, y.first_name, y.last_name, y.weight_class, y.school, y.parent_id, u.email
-- FROM public.youth_wrestlers y
-- JOIN public.users u ON u.id = y.parent_id
-- WHERE lower(y.first_name) = 'zareion' AND lower(y.last_name) = 'berger';
