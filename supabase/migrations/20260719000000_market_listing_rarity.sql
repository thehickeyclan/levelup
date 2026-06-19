-- AI-assessed rarity tier on every market listing (common → grail).
ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS rarity text;

ALTER TABLE public.market_listings
  DROP CONSTRAINT IF EXISTS market_listings_rarity_check;

ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_rarity_check
  CHECK (rarity IS NULL OR rarity IN ('common', 'uncommon', 'rare', 'grail'));

COMMENT ON COLUMN public.market_listings.rarity IS
  'AI/catalog rarity tier: common, uncommon, rare, or grail. Set via shoe ID or rarity assess.';
