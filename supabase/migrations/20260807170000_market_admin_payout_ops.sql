-- Guild Market admin payout ops metadata.
-- This keeps the current manual payout process auditable while we are still
-- paying sellers off-platform.

ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS seller_payout_method text,
  ADD COLUMN IF NOT EXISTS seller_payout_reference text,
  ADD COLUMN IF NOT EXISTS seller_payout_note text;

COMMENT ON COLUMN public.market_orders.seller_payout_method IS 'Manual payout rail used by admin: venmo | zelle | cash | check | other';
COMMENT ON COLUMN public.market_orders.seller_payout_reference IS 'Admin-entered confirmation, Venmo note, transaction reference, or check number';
COMMENT ON COLUMN public.market_orders.seller_payout_note IS 'Internal admin note for seller payout operations';
