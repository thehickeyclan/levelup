-- NFS display mode: sellers catalog pairs without offers or checkout.

ALTER TABLE public.market_listings
  DROP CONSTRAINT IF EXISTS market_listings_listing_type_check;

ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_listing_type_check
  CHECK (listing_type IN ('sell', 'trade', 'vault', 'collection'));
