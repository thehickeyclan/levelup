-- Run once in Supabase Dashboard → SQL Editor (fixes missing colorway + catalog).
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS where possible.

-- 20260717140000_market_ai_dual_condition_scores
ALTER TABLE public.market_ai_analysis
  ADD COLUMN IF NOT EXISTS cosmetic_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS cosmetic_summary text;

-- 20260717150000_market_listing_model_year
ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS model_year integer;

-- 20260717160000_market_listing_wear_state
ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS wear_state text NOT NULL DEFAULT 'used'
    CHECK (wear_state IN ('bnib', 'new_no_box', 'used'));

-- 20260717170000_market_seller_reputation
CREATE TABLE IF NOT EXISTS public.market_seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.market_orders(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_market_seller_reviews_seller
  ON public.market_seller_reviews (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_seller_reviews_buyer
  ON public.market_seller_reviews (buyer_id);

ALTER TABLE public.market_seller_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_seller_reviews_select ON public.market_seller_reviews;
CREATE POLICY market_seller_reviews_select ON public.market_seller_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS market_seller_reviews_insert ON public.market_seller_reviews;
CREATE POLICY market_seller_reviews_insert ON public.market_seller_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.market_orders o
      WHERE o.id = order_id
        AND o.buyer_id = auth.uid()
        AND o.status = 'completed'
    )
  );

CREATE OR REPLACE FUNCTION public.get_market_seller_public_stats(p_seller_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'sales_count', (SELECT count(*)::int FROM public.market_orders o WHERE o.seller_id = p_seller_id AND o.status = 'completed'),
    'review_count', (SELECT count(*)::int FROM public.market_seller_reviews r WHERE r.seller_id = p_seller_id),
    'average_rating', (SELECT round(avg(r.rating)::numeric, 2) FROM public.market_seller_reviews r WHERE r.seller_id = p_seller_id),
    'positive_percent', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE r.rating >= 4) / count(*))::int END
      FROM public.market_seller_reviews r WHERE r.seller_id = p_seller_id
    ),
    'member_since', (SELECT u.created_at FROM public.users u WHERE u.id = p_seller_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_market_seller_sold_history(p_seller_id uuid, p_limit integer DEFAULT 24)
RETURNS TABLE (
  listing_id uuid, title text, brand text, model text, size numeric,
  amount_cents integer, sold_at timestamptz, image_url text, source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  (
    SELECT l.id, l.title, l.brand, l.model, l.size, o.amount_cents,
      coalesce(o.delivered_at, o.updated_at, o.created_at),
      (SELECT i.public_url FROM public.market_listing_images i WHERE i.listing_id = l.id ORDER BY i.display_order LIMIT 1),
      'order'::text
    FROM public.market_orders o
    JOIN public.market_listings l ON l.id = o.listing_id
    WHERE o.seller_id = p_seller_id AND o.status = 'completed'
  )
  UNION ALL
  (
    SELECT l.id, l.title, l.brand, l.model, l.size, l.price_cents, l.updated_at,
      (SELECT i.public_url FROM public.market_listing_images i WHERE i.listing_id = l.id ORDER BY i.display_order LIMIT 1),
      'listing'::text
    FROM public.market_listings l
    WHERE l.seller_id = p_seller_id AND l.status IN ('sold', 'traded')
      AND NOT EXISTS (SELECT 1 FROM public.market_orders o WHERE o.listing_id = l.id AND o.status = 'completed')
  )
  ORDER BY sold_at DESC NULLS LAST
  LIMIT greatest(1, least(p_limit, 50));
$$;

CREATE OR REPLACE FUNCTION public.get_market_seller_public_reviews(p_seller_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, rating integer, comment text, tags text[], created_at timestamptz, buyer_label text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.rating, r.comment, r.tags, r.created_at,
    coalesce(nullif(trim(u.first_name), ''), 'Buyer')
  FROM public.market_seller_reviews r
  JOIN public.users u ON u.id = r.buyer_id
  WHERE r.seller_id = p_seller_id
  ORDER BY r.created_at DESC
  LIMIT greatest(1, least(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.get_market_seller_public_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_seller_sold_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_seller_public_reviews(uuid, integer) TO authenticated;

-- 20260717180000_market_order_shipping
ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_label_storage_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('market-shipping-labels', 'market-shipping-labels', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 20260718120000_market_collection_type
ALTER TABLE public.market_listings DROP CONSTRAINT IF EXISTS market_listings_listing_type_check;
ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_listing_type_check
  CHECK (listing_type IN ('sell', 'trade', 'vault', 'collection'));

-- 20260718130000_market_seller_follows
CREATE TABLE IF NOT EXISTS public.market_seller_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_market_seller_follows_seller ON public.market_seller_follows(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_seller_follows_follower ON public.market_seller_follows(follower_id);

ALTER TABLE public.market_seller_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own market seller follows" ON public.market_seller_follows;
CREATE POLICY "Users manage own market seller follows"
  ON public.market_seller_follows FOR ALL TO authenticated
  USING (follower_id = auth.uid())
  WITH CHECK (follower_id = auth.uid() AND follower_id <> seller_id);

DROP POLICY IF EXISTS "Sellers read own market followers" ON public.market_seller_follows;
CREATE POLICY "Sellers read own market followers"
  ON public.market_seller_follows FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- 20260718140000_market_listing_image_clean
ALTER TABLE public.market_listing_images
  ADD COLUMN IF NOT EXISTS clean_storage_path text,
  ADD COLUMN IF NOT EXISTS clean_public_url text,
  ADD COLUMN IF NOT EXISTS use_clean boolean NOT NULL DEFAULT false;

-- 20260718150000_wrestling_shoes_catalog
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
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS shoe_id_results_select_own ON public.shoe_id_results;
CREATE POLICY shoe_id_results_select_own ON public.shoe_id_results
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

-- 20260718160000 reference images
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS reference_image_urls text[] DEFAULT '{}'::text[];

-- 20260718170000 sale comps
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS sale_comps jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 20260718180000 launch pricing
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS original_msrp_cents integer,
  ADD COLUMN IF NOT EXISTS catalog_price_cents integer,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS inflation_adjusted_price text;

-- 20260718190000 colorway profiles
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS colorway_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 20260718190100 market_listings.colorway  ← fixes your error
ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS colorway text;

COMMENT ON COLUMN public.market_listings.colorway IS 'Specific colorway name (e.g. Cherry) for catalog-matched pricing.';

-- 20260718210000 seller delete policy
DROP POLICY IF EXISTS market_listings_delete ON public.market_listings;
CREATE POLICY market_listings_delete ON public.market_listings
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid());

-- 20260718220000 per-pair follows
CREATE TABLE IF NOT EXISTS public.market_listing_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_market_listing_follows_listing ON public.market_listing_follows(listing_id);
CREATE INDEX IF NOT EXISTS idx_market_listing_follows_follower ON public.market_listing_follows(follower_id);

ALTER TABLE public.market_listing_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own market listing follows" ON public.market_listing_follows;
CREATE POLICY "Users manage own market listing follows"
  ON public.market_listing_follows FOR ALL
  TO authenticated
  USING (follower_id = auth.uid())
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "Sellers read followers on own listings" ON public.market_listing_follows;
CREATE POLICY "Sellers read followers on own listings"
  ON public.market_listing_follows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings ml
      WHERE ml.id = listing_id AND ml.seller_id = auth.uid()
    )
  );
