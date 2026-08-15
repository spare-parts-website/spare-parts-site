-- Adds the product condition field for offers.
ALTER TABLE public."Part"
  ADD COLUMN IF NOT EXISTS "condition" text;
