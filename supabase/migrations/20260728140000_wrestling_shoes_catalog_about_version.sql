-- Track about-spec prompt version so copy improvements can trigger one-time regeneration
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS about_prompt_version smallint NOT NULL DEFAULT 0;
