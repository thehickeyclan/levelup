-- Merge vault listings into collection; collection accepts unsolicited offers by default.
UPDATE public.market_listings
SET listing_type = 'collection', accepts_offers = true
WHERE listing_type = 'vault';

UPDATE public.market_listings
SET accepts_offers = true
WHERE listing_type = 'collection'
  AND (accepts_offers IS NOT TRUE);
