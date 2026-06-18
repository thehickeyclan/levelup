-- Wrestling shoe identification catalog + result log
CREATE TABLE IF NOT EXISTS public.wrestling_shoes_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  model_aliases text[],
  years_produced text,
  colorways jsonb DEFAULT '[]'::jsonb,
  visual_identifiers text[],
  sole_description text,
  upper_material text,
  logo_placement text,
  rarity text CHECK (rarity IN ('common', 'uncommon', 'rare', 'grail')),
  value_low_cents integer,
  value_mid_cents integer,
  value_high_cents integer,
  collector_notes text,
  source text DEFAULT 'manual',
  verified boolean DEFAULT false,
  verified_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrestling_shoes_catalog_brand ON public.wrestling_shoes_catalog (brand);
CREATE INDEX IF NOT EXISTS idx_wrestling_shoes_catalog_model ON public.wrestling_shoes_catalog (model);
CREATE INDEX IF NOT EXISTS idx_wrestling_shoes_catalog_rarity ON public.wrestling_shoes_catalog (rarity);

CREATE TABLE IF NOT EXISTS public.shoe_id_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES public.market_listings(id) ON DELETE SET NULL,
  catalog_match_id uuid REFERENCES public.wrestling_shoes_catalog(id) ON DELETE SET NULL,
  images_analyzed integer,
  identified_brand text,
  identified_model text,
  identified_era text,
  identified_colorway text,
  identified_rarity text,
  value_low_cents integer,
  value_mid_cents integer,
  value_high_cents integer,
  confidence numeric(4, 3),
  raw_response jsonb,
  confirmed boolean DEFAULT false,
  confirmed_model_id uuid REFERENCES public.wrestling_shoes_catalog(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shoe_id_results_user ON public.shoe_id_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shoe_id_results_listing ON public.shoe_id_results (listing_id);

ALTER TABLE public.wrestling_shoes_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shoe_id_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wrestling_shoes_catalog_select ON public.wrestling_shoes_catalog;
CREATE POLICY wrestling_shoes_catalog_select ON public.wrestling_shoes_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wrestling_shoes_catalog_admin_all ON public.wrestling_shoes_catalog;
CREATE POLICY wrestling_shoes_catalog_admin_all ON public.wrestling_shoes_catalog
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS shoe_id_results_select_own ON public.shoe_id_results;
CREATE POLICY shoe_id_results_select_own ON public.shoe_id_results
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  ));
