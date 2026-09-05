-- Phase 1 security/trust hardening. Additive migration intended for production before the matching app release.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminMfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "adminMfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminMfaRecoveryCodes" TEXT,
  ADD COLUMN IF NOT EXISTS "adminMfaLastCounter" BIGINT;

-- Existing accounts predate durable email verification state and remain trusted.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE "LoginVerification"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'LOGIN';
CREATE INDEX IF NOT EXISTS "LoginVerification_userId_purpose_expiresAt_idx"
  ON "LoginVerification" ("userId", "purpose", "expiresAt");

CREATE TABLE IF NOT EXISTS "AdminMfaChallenge" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "secretEncrypted" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminMfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AdminMfaChallenge_userId_purpose_expiresAt_idx" ON "AdminMfaChallenge" ("userId", "purpose", "expiresAt");
CREATE INDEX IF NOT EXISTS "AdminMfaChallenge_expiresAt_idx" ON "AdminMfaChallenge" ("expiresAt");
ALTER TABLE "AdminMfaChallenge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminMfaChallenge" FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS "EmailChangeRequest" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "targetEmail" TEXT NOT NULL UNIQUE,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EmailChangeRequest_expiresAt_idx" ON "EmailChangeRequest" ("expiresAt");
ALTER TABLE "EmailChangeRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EmailChangeRequest" FROM PUBLIC, anon, authenticated;

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "verifiedStoreName" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedBusinessName" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedImage" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedById" TEXT,
  ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "moderationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moderatedById" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_verifiedById_fkey') THEN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_moderatedById_fkey') THEN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_moderationStatus_check') THEN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_moderationStatus_check" CHECK ("moderationStatus" IN ('ACTIVE','UNDER_REVIEW','BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_verificationStatus_check') THEN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_verificationStatus_check" CHECK ("verificationStatus" IN ('UNVERIFIED','PENDING','APPROVED','REJECTED','CHANGES_PENDING','SUSPENDED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Store_moderationStatus_createdAt_idx" ON "Store" ("moderationStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Store_verificationStatus_createdAt_idx" ON "Store" ("verificationStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Store_verifiedById_idx" ON "Store" ("verifiedById");
CREATE INDEX IF NOT EXISTS "Store_moderatedById_idx" ON "Store" ("moderatedById");

UPDATE "Store" s
SET "verifiedStoreName" = COALESCE(s."verifiedStoreName", s."name"),
    "verifiedBusinessName" = COALESCE(s."verifiedBusinessName", v."businessName", s."name"),
    "verifiedPhone" = COALESCE(s."verifiedPhone", s."phone"),
    "verifiedAddress" = COALESCE(s."verifiedAddress", s."address"),
    "verifiedImage" = COALESCE(s."verifiedImage", s."image")
FROM "SellerVerification" v
WHERE s."id" = v."storeId" AND s."verified" = TRUE;
UPDATE "Store" s
SET "verifiedStoreName" = COALESCE(s."verifiedStoreName", s."name"),
    "verifiedBusinessName" = COALESCE(s."verifiedBusinessName", s."name"),
    "verifiedPhone" = COALESCE(s."verifiedPhone", s."phone"),
    "verifiedAddress" = COALESCE(s."verifiedAddress", s."address"),
    "verifiedImage" = COALESCE(s."verifiedImage", s."image")
WHERE s."verified" = TRUE;

-- Preserve the behavior of the old one-off name block while moving visibility to explicit state.
UPDATE "Store"
SET "moderationStatus"='BLOCKED', "moderationReason"='Migrated from legacy moderation rule', "moderatedAt"=CURRENT_TIMESTAMP
WHERE lower(trim("name"))='nigga';

-- Make review trust concurrency-safe. Keep the newest row if historical duplicates ever exist.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "userId", "partId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "ProductReview"
)
DELETE FROM "ProductReview" p USING ranked r WHERE p."id"=r."id" AND r.rn>1;
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "userId", "storeId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "StoreReview"
)
DELETE FROM "StoreReview" s USING ranked r WHERE s."id"=r."id" AND r.rn>1;
CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_userId_partId_key" ON "ProductReview" ("userId", "partId");
CREATE UNIQUE INDEX IF NOT EXISTS "StoreReview_userId_storeId_key" ON "StoreReview" ("userId", "storeId");
