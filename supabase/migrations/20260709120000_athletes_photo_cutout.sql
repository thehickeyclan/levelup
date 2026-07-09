-- Transparent athlete cutout for Instagram session graphics (remove.bg → PNG with alpha).
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS photo_cutout_url TEXT;

COMMENT ON COLUMN public.athletes.photo_cutout_url IS 'PNG with transparent background — subject only, for share graphics. Regenerated when photo_url changes.';
