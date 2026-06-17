-- Guild Market order shipping: carrier, label image, seller ship / buyer receive.

ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_label_storage_path text;

COMMENT ON COLUMN public.market_orders.shipping_carrier IS 'usps | ups | fedex | other';
COMMENT ON COLUMN public.market_orders.shipping_label_storage_path IS 'Private storage path for seller-uploaded label/receipt photo';

-- Private bucket for shipping labels (not public — served via signed URLs in API).
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-shipping-labels', 'market-shipping-labels', false)
ON CONFLICT (id) DO UPDATE SET public = false;
