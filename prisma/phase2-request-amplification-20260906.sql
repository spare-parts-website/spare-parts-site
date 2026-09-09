-- Phase 2 request-amplification hardening: durable notification email outbox
-- and Resend webhook-event reconciliation. Additive; apply after Phase 1.

CREATE TABLE IF NOT EXISTS "EmailOutbox" (
  "id" TEXT PRIMARY KEY,
  "deliveryKey" TEXT NOT NULL UNIQUE,
  "notificationId" TEXT UNIQUE,
  "category" TEXT NOT NULL DEFAULT 'NOTIFICATION',
  "recipientUserId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "providerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmailOutbox_status_check" CHECK ("status" IN ('PENDING','SENDING','RETRY','SENT','FAILED'))
);
CREATE INDEX IF NOT EXISTS "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox" ("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "EmailOutbox_providerId_idx" ON "EmailOutbox" ("providerId");
CREATE INDEX IF NOT EXISTS "EmailOutbox_createdAt_idx" ON "EmailOutbox" ("createdAt");
ALTER TABLE "EmailOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EmailOutbox" FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS "EmailWebhookEvent" (
  "id" TEXT PRIMARY KEY,
  "webhookId" TEXT NOT NULL UNIQUE,
  "providerId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "occurredAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmailWebhookEvent_providerId_processedAt_idx" ON "EmailWebhookEvent" ("providerId", "processedAt");
CREATE INDEX IF NOT EXISTS "EmailWebhookEvent_createdAt_idx" ON "EmailWebhookEvent" ("createdAt");
ALTER TABLE "EmailWebhookEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EmailWebhookEvent" FROM PUBLIC, anon, authenticated;

-- Existing delivery attempts predate the queue. PENDING is now a valid local
-- state before a provider accepts the message; provider webhook statuses remain
-- monotonic once a send is accepted.

-- Keep hot-path rate-limit rows bounded without making request handlers scan
-- the table. The daily maintenance endpoint deletes expired buckets.
CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket" ("resetAt");
