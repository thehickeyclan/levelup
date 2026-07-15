-- Force-correct Canvas CVS history when AI invented ~2018 instead of 2003
UPDATE public.wrestling_shoes_catalog
SET
  years_produced = '2003',
  history_text = 'Introduced in 2003, the Adidas Canvas CVS offered wrestlers a lightweight canvas textile upper with minimal overlays and a full-length unisole rubber outsole aimed at everyday training and practice. Its low-profile fit and classic three-stripe look made it a recognizable scholastic option without the price of premium competition models. Collector interest has grown around clean early-2000s pairs and scarcer colorways, keeping the Canvas CVS on the radar as a period adidas training shoe rather than a modern retail staple.',
  source = 'manual',
  source_notes = 'Admin-verified Canvas CVS — 2003 era; correct AI history that claimed ~2018',
  verified = true,
  verified_by = 'Matt Hickey',
  history_prompt_version = 5,
  updated_at = now()
WHERE brand ILIKE 'Adidas'
  AND (
    model ILIKE 'Canvas CVS'
    OR model ILIKE 'CVS Canvas'
    OR model ILIKE 'Canvas (CVS)'
    OR model ILIKE 'CVS (Canvas)'
  )
  AND (
    history_text ILIKE '%2018%'
    OR history_text ILIKE '%around 2018%'
    OR history_text ILIKE '%introduced around 201%'
    OR verified IS NOT TRUE
    OR source IS DISTINCT FROM 'manual'
  );
