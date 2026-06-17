-- Guild Market seller reputation: buyer reviews + public stats / sold history.

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
  FOR SELECT TO authenticated
  USING (true);

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

COMMENT ON TABLE public.market_seller_reviews IS 'Buyer feedback for completed Guild Market sales (eBay-style seller reputation).';

-- Aggregated public stats for a seller profile.
CREATE OR REPLACE FUNCTION public.get_market_seller_public_stats(p_seller_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'sales_count', (
      SELECT count(*)::int
      FROM public.market_orders o
      WHERE o.seller_id = p_seller_id AND o.status = 'completed'
    ),
    'review_count', (
      SELECT count(*)::int
      FROM public.market_seller_reviews r
      WHERE r.seller_id = p_seller_id
    ),
    'average_rating', (
      SELECT round(avg(r.rating)::numeric, 2)
      FROM public.market_seller_reviews r
      WHERE r.seller_id = p_seller_id
    ),
    'positive_percent', (
      SELECT CASE
        WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE r.rating >= 4) / count(*))::int
      END
      FROM public.market_seller_reviews r
      WHERE r.seller_id = p_seller_id
    ),
    'member_since', (
      SELECT u.created_at
      FROM public.users u
      WHERE u.id = p_seller_id
    )
  );
$$;

-- Public sold history (completed orders + sold listings without a completed order).
CREATE OR REPLACE FUNCTION public.get_market_seller_sold_history(
  p_seller_id uuid,
  p_limit integer DEFAULT 24
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  brand text,
  model text,
  size numeric,
  amount_cents integer,
  sold_at timestamptz,
  image_url text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  (
    SELECT
      l.id AS listing_id,
      l.title,
      l.brand,
      l.model,
      l.size,
      o.amount_cents,
      coalesce(o.delivered_at, o.updated_at, o.created_at) AS sold_at,
      (
        SELECT i.public_url
        FROM public.market_listing_images i
        WHERE i.listing_id = l.id
        ORDER BY i.display_order
        LIMIT 1
      ) AS image_url,
      'order'::text AS source
    FROM public.market_orders o
    JOIN public.market_listings l ON l.id = o.listing_id
    WHERE o.seller_id = p_seller_id
      AND o.status = 'completed'
  )
  UNION ALL
  (
    SELECT
      l.id AS listing_id,
      l.title,
      l.brand,
      l.model,
      l.size,
      l.price_cents AS amount_cents,
      l.updated_at AS sold_at,
      (
        SELECT i.public_url
        FROM public.market_listing_images i
        WHERE i.listing_id = l.id
        ORDER BY i.display_order
        LIMIT 1
      ) AS image_url,
      'listing'::text AS source
    FROM public.market_listings l
    WHERE l.seller_id = p_seller_id
      AND l.status IN ('sold', 'traded')
      AND NOT EXISTS (
        SELECT 1 FROM public.market_orders o
        WHERE o.listing_id = l.id AND o.status = 'completed'
      )
  )
  ORDER BY sold_at DESC NULLS LAST
  LIMIT greatest(1, least(p_limit, 50));
$$;

-- Recent public reviews (buyer first name only).
CREATE OR REPLACE FUNCTION public.get_market_seller_public_reviews(
  p_seller_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  rating integer,
  comment text,
  tags text[],
  created_at timestamptz,
  buyer_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.rating,
    r.comment,
    r.tags,
    r.created_at,
    coalesce(nullif(trim(u.first_name), ''), 'Buyer') AS buyer_label
  FROM public.market_seller_reviews r
  JOIN public.users u ON u.id = r.buyer_id
  WHERE r.seller_id = p_seller_id
  ORDER BY r.created_at DESC
  LIMIT greatest(1, least(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.get_market_seller_public_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_seller_sold_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_seller_public_reviews(uuid, integer) TO authenticated;
