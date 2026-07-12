-- Multiple emoji reactions per activity post (fire, thumbs up, hammer, heart).

ALTER TABLE public.activity_kudos
  ADD COLUMN IF NOT EXISTS reaction text NOT NULL DEFAULT 'hammer';

ALTER TABLE public.activity_kudos
  DROP CONSTRAINT IF EXISTS activity_kudos_post_id_user_id_key;

DROP INDEX IF EXISTS idx_activity_kudos_post_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_kudos_post_user_reaction
  ON public.activity_kudos (post_id, user_id, reaction);

ALTER TABLE public.activity_kudos
  DROP CONSTRAINT IF EXISTS activity_kudos_reaction_check;

ALTER TABLE public.activity_kudos
  ADD CONSTRAINT activity_kudos_reaction_check
  CHECK (reaction IN ('fire', 'thumbs_up', 'hammer', 'heart'));
