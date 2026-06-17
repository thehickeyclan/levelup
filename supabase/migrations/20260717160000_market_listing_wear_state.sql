-- Seller-declared wear: BNIB, new without box, or used (then condition grade applies).

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS wear_state text NOT NULL DEFAULT 'used'
    CHECK (wear_state IN ('bnib', 'new_no_box', 'used'));

COMMENT ON COLUMN public.market_listings.wear_state IS 'bnib = brand new in box; new_no_box = deadstock without box; used = worn (see condition).';
