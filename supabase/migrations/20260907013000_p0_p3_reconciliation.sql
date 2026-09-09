-- P0-P3 reconciliation. Additive and safe to replay against the Sep-2026 hardening baseline.

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "adminMfaSecret" text,
  ADD COLUMN IF NOT EXISTS "adminMfaEnabledAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "adminMfaRecoveryCodes" text,
  ADD COLUMN IF NOT EXISTS "adminMfaLastCounter" bigint;
UPDATE public."User" SET "emailVerifiedAt"=COALESCE("emailVerifiedAt","createdAt") WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE public."LoginVerification" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'LOGIN';
CREATE INDEX IF NOT EXISTS "LoginVerification_userId_purpose_expiresAt_idx" ON public."LoginVerification"("userId","purpose","expiresAt");

CREATE TABLE IF NOT EXISTS public."AdminMfaChallenge" (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  "secretEncrypted" text,
  attempts integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp(3) NOT NULL,
  "consumedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminMfaChallenge_userId_purpose_expiresAt_idx" ON public."AdminMfaChallenge"("userId",purpose,"expiresAt");
CREATE INDEX IF NOT EXISTS "AdminMfaChallenge_expiresAt_idx" ON public."AdminMfaChallenge"("expiresAt");

CREATE TABLE IF NOT EXISTS public."EmailChangeRequest" (
  id text PRIMARY KEY,
  "userId" text NOT NULL UNIQUE REFERENCES public."User"(id) ON DELETE CASCADE,
  "targetEmail" text NOT NULL UNIQUE,
  "codeHash" text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp(3) NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmailChangeRequest_expiresAt_idx" ON public."EmailChangeRequest"("expiresAt");

ALTER TABLE public."Store"
  ADD COLUMN IF NOT EXISTS "verifiedStoreName" text,
  ADD COLUMN IF NOT EXISTS "verifiedBusinessName" text,
  ADD COLUMN IF NOT EXISTS "verifiedPhone" text,
  ADD COLUMN IF NOT EXISTS "verifiedAddress" text,
  ADD COLUMN IF NOT EXISTS "verifiedImage" text,
  ADD COLUMN IF NOT EXISTS "verifiedById" text,
  ADD COLUMN IF NOT EXISTS "moderatedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "moderatedById" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Store_verifiedById_fkey') THEN
    ALTER TABLE public."Store" ADD CONSTRAINT "Store_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES public."User"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Store_moderatedById_fkey') THEN
    ALTER TABLE public."Store" ADD CONSTRAINT "Store_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES public."User"(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Store_verifiedById_idx" ON public."Store"("verifiedById");
CREATE INDEX IF NOT EXISTS "Store_moderatedById_idx" ON public."Store"("moderatedById");
UPDATE public."Store" s SET
  "verifiedStoreName"=COALESCE(s."verifiedStoreName",s.name),
  "verifiedBusinessName"=COALESCE(s."verifiedBusinessName",v."businessName",s.name),
  "verifiedPhone"=COALESCE(s."verifiedPhone",s.phone),
  "verifiedAddress"=COALESCE(s."verifiedAddress",s.address),
  "verifiedImage"=COALESCE(s."verifiedImage",s.image)
FROM public."SellerVerification" v WHERE s.id=v."storeId" AND s.verified=true;

CREATE TABLE IF NOT EXISTS public."Session" (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  "sessionVersion" integer NOT NULL DEFAULT 0,
  "mfaVerifiedAt" timestamp(3),
  "userAgentHash" text,
  "ipHash" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Session_userId_expiresAt_idx" ON public."Session"("userId","expiresAt");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON public."Session"("expiresAt");

CREATE TABLE IF NOT EXISTS public."ProtectedObject" (
  id text PRIMARY KEY,
  "storagePath" text NOT NULL UNIQUE,
  bucket text NOT NULL,
  "ownerId" text NOT NULL,
  purpose text NOT NULL,
  "resourceType" text,
  "resourceId" text,
  status text NOT NULL DEFAULT 'TEMPORARY',
  "deleteAfter" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProtectedObject_ownerId_purpose_idx" ON public."ProtectedObject"("ownerId",purpose);
CREATE INDEX IF NOT EXISTS "ProtectedObject_status_deleteAfter_idx" ON public."ProtectedObject"(status,"deleteAfter");
CREATE INDEX IF NOT EXISTS "ProtectedObject_resource_idx" ON public."ProtectedObject"("resourceType","resourceId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProtectedObject_status_chk') THEN
    ALTER TABLE public."ProtectedObject" ADD CONSTRAINT "ProtectedObject_status_chk" CHECK (status IN ('TEMPORARY','ATTACHED','DELETION_PENDING','DELETED'));
  END IF;
END $$;

-- Reconcile the older hardening outbox with the durable worker shape without deleting queued mail.
ALTER TABLE public."EmailOutbox" ADD COLUMN IF NOT EXISTS "fromEmail" text;
ALTER TABLE public."EmailOutbox" ADD COLUMN IF NOT EXISTS "lockedAt" timestamp(3);
ALTER TABLE public."EmailOutbox" ALTER COLUMN html SET DEFAULT '';
UPDATE public."EmailOutbox" SET html=COALESCE(html,'') WHERE html IS NULL;
ALTER TABLE public."EmailOutbox" ALTER COLUMN html SET NOT NULL;
UPDATE public."EmailOutbox" SET status='RETRY', "lockedAt"=NULL, "nextAttemptAt"=CURRENT_TIMESTAMP WHERE status='PROCESSING';
ALTER TABLE public."EmailOutbox" DROP CONSTRAINT IF EXISTS "EmailOutbox_status_chk";
ALTER TABLE public."EmailOutbox" DROP CONSTRAINT IF EXISTS "EmailOutbox_status_check";
ALTER TABLE public."EmailOutbox" ADD CONSTRAINT "EmailOutbox_status_check" CHECK (status IN ('PENDING','SENDING','RETRY','SENT','FAILED'));
CREATE INDEX IF NOT EXISTS "EmailOutbox_providerId_idx" ON public."EmailOutbox"("providerId");
CREATE INDEX IF NOT EXISTS "EmailOutbox_createdAt_idx" ON public."EmailOutbox"("createdAt");

ALTER TABLE public."EmailWebhookEvent" ADD COLUMN IF NOT EXISTS "webhookId" text;
UPDATE public."EmailWebhookEvent" SET "webhookId"=id WHERE "webhookId" IS NULL;
ALTER TABLE public."EmailWebhookEvent" ALTER COLUMN "webhookId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "EmailWebhookEvent_webhookId_key" ON public."EmailWebhookEvent"("webhookId");
CREATE INDEX IF NOT EXISTS "EmailWebhookEvent_createdAt_idx" ON public."EmailWebhookEvent"("createdAt");

CREATE TABLE IF NOT EXISTS public."AIProviderHealth" (
  provider text PRIMARY KEY,
  status text NOT NULL,
  "consecutiveFailures" integer NOT NULL DEFAULT 0,
  "circuitOpenUntil" timestamp(3),
  "lastFailureCategory" text,
  "lastSuccessAt" timestamp(3),
  "lastFailureAt" timestamp(3),
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AIProviderHealth_status_chk') THEN
    ALTER TABLE public."AIProviderHealth" ADD CONSTRAINT "AIProviderHealth_status_chk" CHECK (status IN ('HEALTHY','DEGRADED','OPEN'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "AIProviderHealth_updatedAt_idx" ON public."AIProviderHealth"("updatedAt");

CREATE TABLE IF NOT EXISTS public."OperationalAlertDedup" (
  kind text PRIMARY KEY,
  "lastSentAt" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "OperationalAlertDedup_lastSentAt_idx" ON public."OperationalAlertDedup"("lastSentAt");

-- Stable keyset/message-read indexes.
CREATE INDEX IF NOT EXISTS "Order_buyerId_createdAt_id_idx" ON public."Order"("buyerId","createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "Order_storeId_createdAt_id_idx" ON public."Order"("storeId","createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "ChatMessage_orderId_createdAt_id_idx" ON public."ChatMessage"("orderId","createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "ChatMessage_receiverId_read_createdAt_idx" ON public."ChatMessage"("receiverId",read,"createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ProductMessage_partId_createdAt_id_idx" ON public."ProductMessage"("partId","createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "ProductMessage_receiverId_read_createdAt_idx" ON public."ProductMessage"("receiverId",read,"createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_updatedAt_id_idx" ON public."SupportTicket"("updatedAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "Report_createdAt_id_idx" ON public."Report"("createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "Dispute_createdAt_id_idx" ON public."Dispute"("createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "SellerVerification_submittedAt_id_idx" ON public."SellerVerification"("submittedAt" DESC,id DESC);

ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProtectedObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminMfaChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AIProviderHealth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OperationalAlertDedup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Session",public."ProtectedObject",public."AdminMfaChallenge",public."EmailChangeRequest",public."EmailOutbox",public."EmailWebhookEvent",public."AIProviderHealth",public."OperationalAlertDedup" FROM PUBLIC,anon,authenticated;
