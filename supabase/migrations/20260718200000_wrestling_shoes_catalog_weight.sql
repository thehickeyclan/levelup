-- Documented shoe weight (e.g. "10.2 oz (289 g)" from manufacturer or GPT research)
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS weight text;
