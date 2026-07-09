-- For-sale listings accept offers under ask by default (opt-out).
UPDATE public.market_listings
SET accepts_offers = true
WHERE listing_type = 'sell'
  AND price_cents IS NOT NULL
  AND price_cents > 0
  AND (accepts_offers IS NOT TRUE);
