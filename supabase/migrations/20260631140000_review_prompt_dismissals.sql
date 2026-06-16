-- Parents can dismiss "leave a review" prompts per coach without submitting a review.

CREATE TABLE IF NOT EXISTS public.review_prompt_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_review_prompt_dismissals_parent
  ON public.review_prompt_dismissals (parent_id);

ALTER TABLE public.review_prompt_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_prompt_dismissals_select_own" ON public.review_prompt_dismissals;
DROP POLICY IF EXISTS "review_prompt_dismissals_insert_own" ON public.review_prompt_dismissals;

CREATE POLICY "review_prompt_dismissals_select_own"
  ON public.review_prompt_dismissals FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY "review_prompt_dismissals_insert_own"
  ON public.review_prompt_dismissals FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());

COMMENT ON TABLE public.review_prompt_dismissals IS
  'Parent dismissed review prompt for a coach; unique on (parent_id, athlete_id).';
