-- Ensure the durable Phase 2 email tables exist before the P0-P3 reconciliation.
-- Existing production tables are preserved by CREATE TABLE IF NOT EXISTS; the
-- following reconciliation migration upgrades older shapes in place.

CREATE TABLE IF NOT EXISTS public."EmailOutbox" (
  id text PRIMARY KEY,
  "deliveryKey" text NOT NULL UNIQUE,
  "notificationId" text UNIQUE,
  category text NOT NULL DEFAULT 'NOTIFICATION',
  "recipientUserId" text,
  "recipientEmail" text NOT NULL,
  "fromEmail" text NOT NULL,
  subject text NOT NULL,
  text text NOT NULL,
  html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" timestamp(3),
  "providerId" text,
  "lastError" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES public."Notification"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES public."User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmailOutbox_status_check" CHECK (status IN ('PENDING','SENDING','RETRY','SENT','FAILED'))
);

CREATE INDEX IF NOT EXISTS "EmailOutbox_status_nextAttemptAt_idx" ON public."EmailOutbox"(status,"nextAttemptAt");

CREATE TABLE IF NOT EXISTS public."EmailWebhookEvent" (
  id text PRIMARY KEY,
  "webhookId" text NOT NULL UNIQUE,
  "providerId" text NOT NULL,
  "eventType" text NOT NULL,
  status text NOT NULL,
  error text,
  "occurredAt" timestamp(3),
  "processedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EmailWebhookEvent_providerId_processedAt_idx" ON public."EmailWebhookEvent"("providerId","processedAt");
