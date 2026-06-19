-- Sellers can delete their own listings (drafts, collection, active w/o pending sale).
DROP POLICY IF EXISTS market_listings_delete ON public.market_listings;
CREATE POLICY market_listings_delete ON public.market_listings
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid());
