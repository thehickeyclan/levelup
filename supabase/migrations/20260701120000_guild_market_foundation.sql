-- Guild Market: listings, orders, trades, offers, AI analysis, storage bucket.

-- ---------------------------------------------------------------------------
-- market_listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('sell', 'trade', 'vault')),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'active', 'sold', 'traded', 'archived', 'removed', 'pending_sale')
  ),
  title text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  size numeric(4,1) NOT NULL DEFAULT 10,
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('new', 'like_new', 'good', 'fair')),
  price_cents integer,
  shipping_cents integer NOT NULL DEFAULT 0,
  open_to_trade boolean NOT NULL DEFAULT false,
  open_to_boot boolean NOT NULL DEFAULT false,
  description text,
  weight_class text,
  locked_buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz,
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_listings_status ON public.market_listings (status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON public.market_listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_brand_model ON public.market_listings (brand, model);
CREATE INDEX IF NOT EXISTS idx_market_listings_tenant ON public.market_listings (tenant_slug);

-- ---------------------------------------------------------------------------
-- market_listing_images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_listing_images_listing ON public.market_listing_images (listing_id);

-- ---------------------------------------------------------------------------
-- market_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text GENERATED ALWAYS AS (
    'MKT-' || upper(substring(replace(id::text, '-', ''), 1, 8))
  ) STORED,
  tenant_slug text NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.market_listings(id),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payout_recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  shipping_cents integer NOT NULL DEFAULT 0,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  seller_payout_cents integer NOT NULL DEFAULT 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN (
      'pending_payment', 'paid', 'shipped', 'delivered', 'completed',
      'disputed', 'refunded', 'cancelled'
    )
  ),
  shipping_address jsonb,
  tracking_number text,
  seller_condition text,
  ai_condition_grade text,
  ai_condition_score numeric(3,1),
  shipped_at timestamptz,
  delivered_at timestamptz,
  seller_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_orders_buyer ON public.market_orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_market_orders_seller ON public.market_orders (seller_id);
CREATE INDEX IF NOT EXISTS idx_market_orders_listing ON public.market_orders (listing_id);
CREATE INDEX IF NOT EXISTS idx_market_orders_status ON public.market_orders (status);

-- ---------------------------------------------------------------------------
-- market_trades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  initiator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  initiator_listing_id uuid NOT NULL REFERENCES public.market_listings(id),
  receiver_listing_id uuid NOT NULL REFERENCES public.market_listings(id),
  boot_amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'receiver_accepted', 'fees_pending', 'completed',
      'rejected', 'cancelled', 'expired'
    )
  ),
  initiator_fee_paid boolean NOT NULL DEFAULT false,
  receiver_fee_paid boolean NOT NULL DEFAULT false,
  initiator_stripe_session_id text,
  receiver_stripe_session_id text,
  expires_at timestamptz NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_trades_initiator ON public.market_trades (initiator_id);
CREATE INDEX IF NOT EXISTS idx_market_trades_receiver ON public.market_trades (receiver_id);

-- ---------------------------------------------------------------------------
-- market_offers (vault)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_type text NOT NULL CHECK (offer_type IN ('cash', 'trade', 'cash_and_trade')),
  amount_cents integer,
  trade_listing_id uuid REFERENCES public.market_listings(id),
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'expired', 'countered')
  ),
  expires_at timestamptz NOT NULL,
  accepted_order_id uuid REFERENCES public.market_orders(id),
  accepted_trade_id uuid REFERENCES public.market_trades(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_offers_listing ON public.market_offers (listing_id);

-- ---------------------------------------------------------------------------
-- market_ai_analysis
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  condition_score numeric(3,1),
  condition_grade_suggested text,
  condition_breakdown jsonb,
  condition_summary text,
  listing_tip text,
  price_suggested_low_cents integer,
  price_suggested_mid_cents integer,
  price_suggested_high_cents integer,
  price_confidence text,
  price_confidence_note text,
  price_comps jsonb,
  price_market_note text,
  agent_draft jsonb,
  model_used text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id)
);

-- ---------------------------------------------------------------------------
-- market_ai_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.market_listings(id) ON DELETE SET NULL,
  route text NOT NULL,
  model_used text,
  tokens_in integer,
  tokens_out integer,
  cost_estimate_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_ai_logs_user ON public.market_ai_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- market_ai_usage (hourly rate limit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);

CREATE OR REPLACE FUNCTION public.increment_market_ai_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  v_window := date_trunc('hour', now());
  INSERT INTO public.market_ai_usage (user_id, window_start, call_count)
  VALUES (p_user_id, v_window, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET call_count = public.market_ai_usage.call_count + 1
  RETURNING call_count INTO v_count;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS market_listings_updated_at ON public.market_listings;
CREATE TRIGGER market_listings_updated_at
  BEFORE UPDATE ON public.market_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS market_orders_updated_at ON public.market_orders;
CREATE TRIGGER market_orders_updated_at
  BEFORE UPDATE ON public.market_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS market_trades_updated_at ON public.market_trades;
CREATE TRIGGER market_trades_updated_at
  BEFORE UPDATE ON public.market_trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_listings_select ON public.market_listings;
CREATE POLICY market_listings_select ON public.market_listings
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'sold', 'traded')
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_listings_insert ON public.market_listings;
CREATE POLICY market_listings_insert ON public.market_listings
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS market_listings_update ON public.market_listings;
CREATE POLICY market_listings_update ON public.market_listings
  FOR UPDATE TO authenticated
  USING (
    seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_listing_images_select ON public.market_listing_images;
CREATE POLICY market_listing_images_select ON public.market_listing_images
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS market_listing_images_insert ON public.market_listing_images;
CREATE POLICY market_listing_images_insert ON public.market_listing_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS market_listing_images_delete ON public.market_listing_images;
CREATE POLICY market_listing_images_delete ON public.market_listing_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS market_orders_select ON public.market_orders;
CREATE POLICY market_orders_select ON public.market_orders
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR payout_recipient_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_orders_insert ON public.market_orders;
CREATE POLICY market_orders_insert ON public.market_orders
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS market_orders_admin_update ON public.market_orders;
CREATE POLICY market_orders_admin_update ON public.market_orders
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS market_trades_select ON public.market_trades;
CREATE POLICY market_trades_select ON public.market_trades
  FOR SELECT TO authenticated
  USING (
    initiator_id = auth.uid()
    OR receiver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_offers_select ON public.market_offers;
CREATE POLICY market_offers_select ON public.market_offers
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_ai_analysis_select ON public.market_ai_analysis;
CREATE POLICY market_ai_analysis_select ON public.market_ai_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND (
        l.seller_id = auth.uid()
        OR l.status IN ('active', 'sold', 'traded')
      )
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS market_ai_logs_admin ON public.market_ai_logs;
CREATE POLICY market_ai_logs_admin ON public.market_ai_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS market_ai_usage_select ON public.market_ai_usage;
CREATE POLICY market_ai_usage_select ON public.market_ai_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: market-listing-photos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-listing-photos', 'market-listing-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS market_photos_public_read ON storage.objects;
CREATE POLICY market_photos_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'market-listing-photos');

DROP POLICY IF EXISTS market_photos_seller_insert ON storage.objects;
CREATE POLICY market_photos_seller_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'market-listing-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS market_photos_seller_delete ON storage.objects;
CREATE POLICY market_photos_seller_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'market-listing-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

COMMENT ON TABLE public.market_listings IS 'Guild Market sneaker listings (sell, trade, vault).';
