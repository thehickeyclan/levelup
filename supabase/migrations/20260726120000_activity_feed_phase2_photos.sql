-- Activity Feed Phase 2: session photo posts

CREATE TABLE IF NOT EXISTS public.activity_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.activity_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_photos_post
  ON public.activity_photos (post_id, display_order);

ALTER TABLE public.activity_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_photos_service_all ON public.activity_photos;
CREATE POLICY activity_photos_service_all ON public.activity_photos
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS activity_photos_select ON public.activity_photos;
CREATE POLICY activity_photos_select ON public.activity_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_posts p
      WHERE p.id = activity_photos.post_id
        AND (
          p.is_public = true
          OR p.actor_parent_id = auth.uid()
          OR p.youth_wrestler_id = auth.uid()
          OR p.coach_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestlers yw
            WHERE yw.id = p.youth_wrestler_id AND yw.parent_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.youth_wrestler_parents ywp
            WHERE ywp.youth_wrestler_id = p.youth_wrestler_id AND ywp.parent_id = auth.uid()
          )
        )
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-photos',
  'activity-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS activity_photos_storage_insert ON storage.objects;
CREATE POLICY activity_photos_storage_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'activity-photos');

DROP POLICY IF EXISTS activity_photos_storage_select ON storage.objects;
CREATE POLICY activity_photos_storage_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'activity-photos');
