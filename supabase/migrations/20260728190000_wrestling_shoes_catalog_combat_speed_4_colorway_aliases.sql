-- Combat Speed 4 colorway profiles with verified community nicknames
DO $$
DECLARE
  target_id uuid;
  profiles jsonb := '[
    {
      "name": "Solar Green / Solar Pink / Watermelon",
      "availability": "current_retail",
      "aliases": ["Watermelons", "Watermelon"]
    },
    {
      "name": "Black / White",
      "availability": "current_retail"
    },
    {
      "name": "Royal / White",
      "availability": "current_retail"
    }
  ]'::jsonb;
BEGIN
  SELECT id INTO target_id
  FROM public.wrestling_shoes_catalog
  WHERE brand ILIKE 'Adidas' AND model ILIKE 'Combat Speed 4'
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.wrestling_shoes_catalog SET
      colorway_profiles = profiles,
      updated_at = now()
    WHERE id = target_id;
  END IF;
END $$;
