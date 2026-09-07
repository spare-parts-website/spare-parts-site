-- A newly-created ACTIVE listing is not a moderation decision. Leave
-- moderatedAt empty until a lifecycle transition occurs.
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
    IF NEW."moderatedAt" IS NOT DISTINCT FROM OLD."moderatedAt" THEN
      NEW."moderatedAt" := CURRENT_TIMESTAMP;
    END IF;
  ELSIF NEW."blocked" IS DISTINCT FROM OLD."blocked" THEN
    NEW."moderationStatus" := CASE WHEN NEW."blocked" THEN 'BLOCKED' ELSE 'ACTIVE' END;
    IF NEW."moderatedAt" IS NOT DISTINCT FROM OLD."moderatedAt" THEN
      NEW."moderatedAt" := CURRENT_TIMESTAMP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
