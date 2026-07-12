-- Verified ASICS Matflex 3 catalog row (facts paraphrased from Drew Phipps, The Wrestling Shoe Handbook)
DO $$
DECLARE
  target_id uuid;
  now_ts timestamptz := now();
BEGIN
  SELECT id INTO target_id
  FROM public.wrestling_shoes_catalog
  WHERE brand ILIKE 'ASICS' AND model ILIKE 'Matflex 3'
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.wrestling_shoes_catalog SET
      model_aliases = ARRAY['Matflex', 'MatFlex 3'],
      years_produced = '2000s–present (generation 3 of 6)',
      colorways = '["Black/Silver", "Red/White", "Blue/White"]'::jsonb,
      visual_identifiers = ARRAY[
        'ASICS tiger stripes',
        'MATFLEX branding',
        'Gum rubber outsole',
        'Mesh upper'
      ],
      sole_description = 'Full-length gum rubber outsole (not split sole). Early Matflex generations used a flatter sole than later models.',
      upper_material = 'Mesh upper with synthetic overlays',
      shoe_type = 'Entry-level competition and training',
      closure_type = 'Lace-up',
      fit_notes = 'True to size',
      notable_features = 'Third generation of the ASICS Matflex line (six generations total: Matflex 1–6)',
      history_text = 'The ASICS Matflex line is one of the brand''s best-selling entry-level wrestling shoes, with an original Matflex debuting in the early 2000s and six generations through the Matflex 6. Built with tough gum rubber soles and mesh uppers, Matflex models are comfortable, durable, and staples for youth and high school programs. Collectors often overlook them as a beginner shoe, but the line remains a reliable workhorse on the scholastic circuit.',
      collector_notes = 'Collectors sometimes dismiss Matflex as a beginner shoe, but the line is well made and durable for scholastic wrestling.',
      rarity = 'common',
      source = 'phipps_handbook',
      source_notes = 'Drew Phipps, The Wrestling Shoe Handbook — Matflex chapter (OG early 2000s, six generations, gum rubber full outsole, mesh upper)',
      reference_url = NULL,
      verified = true,
      verified_by = 'Matt Hickey',
      about_generated_at = now_ts,
      history_generated_at = now_ts,
      about_prompt_version = 1,
      history_prompt_version = 3,
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
      'ASICS',
      'Matflex 3',
      ARRAY['Matflex', 'MatFlex 3'],
      '2000s–present (generation 3 of 6)',
      '["Black/Silver", "Red/White", "Blue/White"]'::jsonb,
      ARRAY[
        'ASICS tiger stripes',
        'MATFLEX branding',
        'Gum rubber outsole',
        'Mesh upper'
      ],
      'Full-length gum rubber outsole (not split sole). Early Matflex generations used a flatter sole than later models.',
      'Mesh upper with synthetic overlays',
      'Entry-level competition and training',
      'Lace-up',
      'True to size',
      'Third generation of the ASICS Matflex line (six generations total: Matflex 1–6)',
      'The ASICS Matflex line is one of the brand''s best-selling entry-level wrestling shoes, with an original Matflex debuting in the early 2000s and six generations through the Matflex 6. Built with tough gum rubber soles and mesh uppers, Matflex models are comfortable, durable, and staples for youth and high school programs. Collectors often overlook them as a beginner shoe, but the line remains a reliable workhorse on the scholastic circuit.',
      'Collectors sometimes dismiss Matflex as a beginner shoe, but the line is well made and durable for scholastic wrestling.',
      'common',
      'phipps_handbook',
      'Drew Phipps, The Wrestling Shoe Handbook — Matflex chapter (OG early 2000s, six generations, gum rubber full outsole, mesh upper)',
      NULL,
      true,
      'Matt Hickey',
      now_ts,
      now_ts,
      1,
      3,
      now_ts
    );
  END IF;
END $$;
