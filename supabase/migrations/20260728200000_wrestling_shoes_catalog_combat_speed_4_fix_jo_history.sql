-- Force-correct Combat Speed 4 history when AI wrongly attributed Jordan Oliver PE
UPDATE public.wrestling_shoes_catalog
SET
  history_text = 'The Adidas Combat Speed 4 sits in adidas''s long-running Combat Speed line, pairing a lightweight mesh upper with split-suede overlays on a split-sole platform tuned for competition speed and mat traction. As a retail staple rather than an athlete-exclusive release, standard Combat Speed 4 colorways target wrestlers who want a low-profile, flexible fit without the bulk of a training shoe. Collectors and competitors alike track deadstock retail pairs, but the model''s identity is defined by weight and split-sole agility — not a single signature tie-in.',
  collector_notes = 'Base retail Combat Speed 4 colorways are distinct from Jordan Oliver signature PE releases — verify branding before attributing an athlete edition.',
  source = 'manual',
  source_notes = 'Admin-verified retail Combat Speed 4 — base model specs and history; not Jordan Oliver PE',
  verified = true,
  verified_by = 'Matt Hickey',
  history_prompt_version = 4,
  updated_at = now()
WHERE brand ILIKE 'Adidas'
  AND model ILIKE 'Combat Speed 4'
  AND (
    history_text ILIKE '%jordan oliver%'
    OR history_text ILIKE '%signature edition%'
    OR history_text ILIKE '%introduced in 2014%'
    OR verified IS NOT TRUE
    OR source IS DISTINCT FROM 'manual'
  );
