-- Admin-managed custom market brands (core brands remain in app code).
-- Run in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.market_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL DEFAULT 'guild',
  name text NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_brands_tenant_name_lower
  ON public.market_brands (tenant_slug, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_market_brands_tenant ON public.market_brands (tenant_slug);

ALTER TABLE public.market_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_brands_select ON public.market_brands;
CREATE POLICY market_brands_select ON public.market_brands
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS market_brands_insert ON public.market_brands;
CREATE POLICY market_brands_insert ON public.market_brands
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
