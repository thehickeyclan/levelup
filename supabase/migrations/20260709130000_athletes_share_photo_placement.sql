-- Per-coach tuning for Instagram session share graphic athlete cutout placement.
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS share_photo_scale SMALLINT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS share_photo_offset_x SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_photo_offset_y SMALLINT DEFAULT 0;

COMMENT ON COLUMN public.athletes.share_photo_scale IS 'Share graphic cutout scale 50–150 (100 = default slot fill).';
COMMENT ON COLUMN public.athletes.share_photo_offset_x IS 'Share graphic cutout horizontal nudge in px (positive = right).';
COMMENT ON COLUMN public.athletes.share_photo_offset_y IS 'Share graphic cutout vertical nudge in px (positive = down).';
