-- Activity feed posts when a collection listing is published to Guild Market
ALTER TABLE public.activity_posts
  DROP CONSTRAINT IF EXISTS activity_posts_trigger_type_check;

ALTER TABLE public.activity_posts
  ADD CONSTRAINT activity_posts_trigger_type_check CHECK (trigger_type IN (
    'session_completed', 'milestone_hit', 'photo_post', 'review_posted',
    'booking_confirmed', 'market_purchase', 'market_listing_sold', 'market_trade_completed',
    'market_collection_listed'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_posts_market_collection_listed
  ON public.activity_posts (market_listing_id)
  WHERE trigger_type = 'market_collection_listed' AND market_listing_id IS NOT NULL;

-- Backfill activity cards for collection listings already live with photos
INSERT INTO public.activity_posts (
  trigger_type,
  actor_parent_id,
  youth_wrestler_id,
  market_listing_id,
  is_public,
  parent_approved
)
SELECT
  'market_collection_listed',
  ml.seller_id,
  (
    SELECT yw.id
    FROM public.youth_wrestlers yw
    WHERE yw.parent_id = ml.seller_id
    ORDER BY yw.created_at ASC
    LIMIT 1
  ),
  ml.id,
  true,
  true
FROM public.market_listings ml
WHERE ml.listing_type = 'collection'
  AND ml.status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.market_listing_images img WHERE img.listing_id = ml.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_posts ap
    WHERE ap.market_listing_id = ml.id
      AND ap.trigger_type = 'market_collection_listed'
  );
