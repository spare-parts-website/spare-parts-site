-- Stores the display order for the additional images of a part.
-- The Part.image column remains the selected main image.
ALTER TABLE public."PartImage"
  ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PartImage_partId_position_idx"
  ON public."PartImage" ("partId", "position");
