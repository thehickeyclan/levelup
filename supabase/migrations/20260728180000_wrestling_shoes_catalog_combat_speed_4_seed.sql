-- Verified Adidas Combat Speed 4 base retail catalog row (not Jordan Oliver PE)
DO $$
DECLARE
  target_id uuid;
  now_ts timestamptz := now();
BEGIN
  SELECT id INTO target_id
  FROM public.wrestling_shoes_catalog
  WHERE brand ILIKE 'Adidas' AND model ILIKE 'Combat Speed 4'
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.wrestling_shoes_catalog SET
      model_aliases = ARRAY['Combat Speed', 'CS4'],
      years_produced = '2010s–present',
      colorways = '["Solar Green / Solar Pink / Watermelon", "Black / White", "Royal / White"]'::jsonb,
      visual_identifiers = ARRAY[
        'Three stripes branding',
        'Mesh upper with split-suede overlays',
        'Combat Speed 4 split sole',
        'Lace-up with ankle strap'
      ],
      sole_description = 'Combat Speed 4 split sole with lightweight competition traction and a flexible forefoot platform',
      upper_material = 'Lightweight mesh with split-suede overlays for durability and flexibility',
      shoe_type = 'Competition',
      closure_type = 'Lace-up with ankle strap',
      fit_notes = 'Runs true to size; snug, low-profile fit',
      notable_features = 'Ultra-lightweight construction with split-suede outsole overlays designed for speed and mat traction in competition',
      history_text = 'The Adidas Combat Speed 4 sits in adidas''s long-running Combat Speed line, pairing a lightweight mesh upper with split-suede overlays on a split-sole platform tuned for competition speed and mat traction. As a retail staple rather than an athlete-exclusive release, standard Combat Speed 4 colorways target wrestlers who want a low-profile, flexible fit without the bulk of a training shoe. Collectors and competitors alike track deadstock retail pairs, but the model''s identity is defined by weight and split-sole agility — not a single signature tie-in.',
      collector_notes = 'Base retail Combat Speed 4 colorways are distinct from Jordan Oliver signature PE releases — verify branding before attributing an athlete edition.',
      rarity = 'common',
      source = 'manual',
      source_notes = 'Admin-verified retail Combat Speed 4 — base model specs and history; not Jordan Oliver PE',
      reference_url = NULL,
      verified = true,
      verified_by = 'Matt Hickey',
      about_generated_at = now_ts,
      history_generated_at = now_ts,
      about_prompt_version = 2,
      history_prompt_version = 4,
      updated_at = now_ts
    WHERE id = target_id;
  ELSE
    INSERT INTO public.wrestling_shoes_catalog (
      brand,
      model,
      model_aliases,
      years_produced,
      colorways,
      visual_identifiers,
      sole_description,
      upper_material,
      shoe_type,
      closure_type,
      fit_notes,
      notable_features,
      history_text,
      collector_notes,
      rarity,
      source,
      source_notes,
      reference_url,
      verified,
      verified_by,
      about_generated_at,
      history_generated_at,
      about_prompt_version,
      history_prompt_version,
      updated_at
    ) VALUES (
      'Adidas',
      'Combat Speed 4',
      ARRAY['Combat Speed', 'CS4'],
      '2010s–present',
      '["Solar Green / Solar Pink / Watermelon", "Black / White", "Royal / White"]'::jsonb,
      ARRAY[
        'Three stripes branding',
        'Mesh upper with split-suede overlays',
        'Combat Speed 4 split sole',
        'Lace-up with ankle strap'
      ],
      'Combat Speed 4 split sole with lightweight competition traction and a flexible forefoot platform',
      'Lightweight mesh with split-suede overlays for durability and flexibility',
      'Competition',
      'Lace-up with ankle strap',
      'Runs true to size; snug, low-profile fit',
      'Ultra-lightweight construction with split-suede outsole overlays designed for speed and mat traction in competition',
      'The Adidas Combat Speed 4 sits in adidas''s long-running Combat Speed line, pairing a lightweight mesh upper with split-suede overlays on a split-sole platform tuned for competition speed and mat traction. As a retail staple rather than an athlete-exclusive release, standard Combat Speed 4 colorways target wrestlers who want a low-profile, flexible fit without the bulk of a training shoe. Collectors and competitors alike track deadstock retail pairs, but the model''s identity is defined by weight and split-sole agility — not a single signature tie-in.',
      'Base retail Combat Speed 4 colorways are distinct from Jordan Oliver signature PE releases — verify branding before attributing an athlete edition.',
      'common',
      'manual',
      'Admin-verified retail Combat Speed 4 — base model specs and history; not Jordan Oliver PE',
      NULL,
      true,
      'Matt Hickey',
      now_ts,
      now_ts,
      2,
      4,
      now_ts
    );
  END IF;
END $$;
