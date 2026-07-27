-- Private, coach-created short-form learning library.
-- Videos are intentionally stored in a private bucket and delivered with short-lived signed URLs.

CREATE TABLE IF NOT EXISTS public.coach_playbook_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  caption text CHECK (caption IS NULL OR char_length(caption) <= 500),
  category text NOT NULL DEFAULT 'coaching'
    CHECK (category IN (
      'coaching',
      'facilities',
      'session_ideas',
      'parent_communication',
      'business',
      'recruiting',
      'other'
    )),
  storage_path text NOT NULL UNIQUE,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_playbook_posts_created_idx
  ON public.coach_playbook_posts (created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS coach_playbook_posts_category_idx
  ON public.coach_playbook_posts (category, created_at DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.coach_playbook_reactions (
  post_id uuid NOT NULL REFERENCES public.coach_playbook_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.coach_playbook_saves (
  post_id uuid NOT NULL REFERENCES public.coach_playbook_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.coach_playbook_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_playbook_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_playbook_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_playbook_coach_read ON public.coach_playbook_posts;
CREATE POLICY coach_playbook_coach_read ON public.coach_playbook_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('coach', 'admin')
    )
  );

DROP POLICY IF EXISTS coach_playbook_coach_insert ON public.coach_playbook_posts;
CREATE POLICY coach_playbook_coach_insert ON public.coach_playbook_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      coach_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS coach_playbook_owner_update ON public.coach_playbook_posts;
CREATE POLICY coach_playbook_owner_update ON public.coach_playbook_posts
  FOR UPDATE TO authenticated
  USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS coach_playbook_owner_delete ON public.coach_playbook_posts;
CREATE POLICY coach_playbook_owner_delete ON public.coach_playbook_posts
  FOR DELETE TO authenticated
  USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS coach_playbook_reactions_coach_access ON public.coach_playbook_reactions;
CREATE POLICY coach_playbook_reactions_coach_access ON public.coach_playbook_reactions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('coach', 'admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('coach', 'admin')
    )
  );

DROP POLICY IF EXISTS coach_playbook_saves_coach_access ON public.coach_playbook_saves;
CREATE POLICY coach_playbook_saves_coach_access ON public.coach_playbook_saves
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('coach', 'admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('coach', 'admin')
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-playbook-videos',
  'coach-playbook-videos',
  false,
  78643200,
  ARRAY['video/mp4', 'video/quicktime', 'video/x-m4v']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
