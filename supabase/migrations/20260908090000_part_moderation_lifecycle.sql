-- Explicit product moderation lifecycle. The legacy blocked flag remains as a
-- compatibility projection while moderationStatus is the visibility authority.
ALTER TABLE public."Part"
  ADD COLUMN IF NOT EXISTS "moderationStatus" text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "moderationReason" text,
  ADD COLUMN IF NOT EXISTS "moderatedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "moderatedById" text;

UPDATE public."Part"
SET "moderationStatus" = CASE WHEN "blocked" THEN 'BLOCKED' ELSE 'ACTIVE' END
WHERE "moderationStatus" IS NULL OR "moderationStatus" NOT IN ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'BLOCKED') OR "blocked" = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Part_moderatedById_fkey') THEN
    ALTER TABLE public."Part"
      ADD CONSTRAINT "Part_moderatedById_fkey"
      FOREIGN KEY ("moderatedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Part_moderationStatus_check') THEN
    ALTER TABLE public."Part"
      ADD CONSTRAINT "Part_moderationStatus_check"
      CHECK ("moderationStatus" IN ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'BLOCKED'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Part_moderationStatus_createdAt_idx"
  ON public."Part" ("moderationStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Part_moderatedById_idx"
  ON public."Part" ("moderatedById");

-- Keep older code paths safe during the rollout. Explicit lifecycle writes win;
-- legacy blocked-only writes are promoted to ACTIVE/BLOCKED automatically.
CREATE OR REPLACE FUNCTION public.sync_part_moderation_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."blocked" THEN
      NEW."moderationStatus" := 'BLOCKED';
    ELSIF NEW."moderationStatus" IS NULL OR NEW."moderationStatus" NOT IN ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'BLOCKED') THEN
      NEW."moderationStatus" := 'ACTIVE';
    END IF;
  ELSIF NEW."moderationStatus" IS DISTINCT FROM OLD."moderationStatus" THEN
    NEW."blocked" := NEW."moderationStatus" = 'BLOCKED';
  ELSIF NEW."blocked" IS DISTINCT FROM OLD."blocked" THEN
    NEW."moderationStatus" := CASE WHEN NEW."blocked" THEN 'BLOCKED' ELSE 'ACTIVE' END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."moderatedAt" := CURRENT_TIMESTAMP;
  ELSIF NEW."moderationStatus" IS DISTINCT FROM OLD."moderationStatus"
        AND NEW."moderatedAt" IS NOT DISTINCT FROM OLD."moderatedAt" THEN
    NEW."moderatedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Part_moderation_projection" ON public."Part";
CREATE TRIGGER "Part_moderation_projection"
  BEFORE INSERT OR UPDATE OF "blocked", "moderationStatus" ON public."Part"
  FOR EACH ROW EXECUTE FUNCTION public.sync_part_moderation_projection();
