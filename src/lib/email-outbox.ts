import 'server-only'

import { randomUUID } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { recordEmailDeliveryAttempt, type EmailDeliveryCategory } from '@/lib/email-delivery'
import { normalizeRecipientEmail, sanitizeDeliveryReason } from '@/lib/email-deliverability'
import { reconcileWebhookEvents } from '@/lib/email-webhook-events'
import { getTransactionalSender } from '@/lib/email-sender'

type OutboxRow = {
  id: string
  deliveryKey: string
  notificationId: string | null
  category: string
  recipientUserId: string | null
  recipientEmail: string
  fromEmail: string | null
  subject: string
  text: string
  html: string
  attempts: number
}

const MAX_ATTEMPTS = 5
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]

export async function queueEmailOutbox(input: {
  deliveryKey: string
  category: EmailDeliveryCategory
  notificationId?: string | null
  recipientUserId?: string | null
  recipientEmail: string
  fromEmail: string
  subject: string
  text: string
  html: string
}) {
  const deliveryKey = input.deliveryKey.trim().slice(0, 180)
  const recipientEmail = normalizeRecipientEmail(input.recipientEmail)
  if (!deliveryKey || !recipientEmail) return false
  await recordEmailDeliveryAttempt({ deliveryKey, category: input.category, notificationId: input.notificationId || null, recipientUserId: input.recipientUserId || null, recipientEmail, status: 'PENDING' })
  await db.$executeRaw`
    INSERT INTO "EmailOutbox" ("id","deliveryKey","notificationId","category","recipientUserId","recipientEmail","fromEmail","subject","text","html","status","attempts","nextAttemptAt","createdAt","updatedAt")
    VALUES (${randomUUID()},${deliveryKey},${input.notificationId || null},${input.category},${input.recipientUserId || null},${recipientEmail},${input.fromEmail},${input.subject},${input.text},${input.html},'PENDING',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("deliveryKey") DO NOTHING
  `
  return true
}

async function claimOutboxRows(limit: number) {
  const now = new Date()
  const staleLock = new Date(Date.now() - 10 * 60_000)
  return db.$queryRaw<OutboxRow[]>`
    WITH candidate AS (
      SELECT "id" FROM "EmailOutbox"
      WHERE (("status" IN ('PENDING','RETRY') AND "nextAttemptAt" <= ${now}) OR ("status"='SENDING' AND "lockedAt" IS NOT NULL AND "lockedAt" <= ${staleLock}))
      ORDER BY "nextAttemptAt" ASC,"createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${Math.max(1, Math.min(limit, 100))}
    )
    UPDATE "EmailOutbox" o SET "status"='SENDING',"lockedAt"=CURRENT_TIMESTAMP,"attempts"=o."attempts"+1,"updatedAt"=CURRENT_TIMESTAMP
    FROM candidate c WHERE o."id"=c."id"
    RETURNING o."id",o."deliveryKey",o."notificationId",o."category",o."recipientUserId",o."recipientEmail",o."fromEmail",o."subject",o."text",o."html",o."attempts"
  `
}

async function failOrRetry(row: OutboxRow, error: unknown) {
  const message = sanitizeDeliveryReason(error instanceof Error ? error.message : 'email provider failed') || 'email provider failed'
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.$executeRaw`UPDATE "EmailOutbox" SET "status"='FAILED',"lockedAt"=NULL,"lastError"=${message},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`
    await recordEmailDeliveryAttempt({ deliveryKey: row.deliveryKey, category: row.category as EmailDeliveryCategory, notificationId: row.notificationId, recipientUserId: row.recipientUserId, recipientEmail: row.recipientEmail, status: 'FAILED', error: message })
    return
  }
  const nextAttemptAt = new Date(Date.now() + BACKOFF_MS[Math.min(row.attempts - 1, BACKOFF_MS.length - 1)])
  await db.$executeRaw`UPDATE "EmailOutbox" SET "status"='RETRY',"lockedAt"=NULL,"lastError"=${message},"nextAttemptAt"=${nextAttemptAt},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`
}

export async function processEmailOutboxBatch(limit = 8) {
  const rows = await claimOutboxRows(limit)
  if (!rows.length) return { processed: 0, sent: 0, failed: 0 }
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const fallbackSender = getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL)
  let sent = 0
  let failed = 0
  for (const row of rows) {
    try {
      if (!resend) throw new Error('RESEND_API_KEY is not configured')
      const fromEmail = row.fromEmail?.trim() || fallbackSender
      if (!fromEmail) throw new Error('Transactional sender is not configured')
      const result = await resend.emails.send({ from: `غيار ماركت <${fromEmail}>`, to: row.recipientEmail, subject: row.subject, text: row.text, html: row.html, ...(row.notificationId ? { tags: [{ name: 'notification_id', value: row.notificationId }] } : {}) }, { idempotencyKey: row.deliveryKey })
      if (result.error) throw new Error(result.error.message)
      const providerId = result.data?.id || null
      if (!providerId) throw new Error('Resend did not return a provider id')
      await db.$executeRaw`UPDATE "EmailOutbox" SET "status"='SENT',"providerId"=${providerId},"lockedAt"=NULL,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`
      await recordEmailDeliveryAttempt({ deliveryKey: row.deliveryKey, category: row.category as EmailDeliveryCategory, notificationId: row.notificationId, recipientUserId: row.recipientUserId, recipientEmail: row.recipientEmail, providerId, status: 'SENT' })
      await reconcileWebhookEvents(providerId)
      sent += 1
    } catch (error) { failed += 1; await failOrRetry(row, error) }
  }
  return { processed: rows.length, sent, failed }
}

export async function cleanupEmailQueueHistory() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000)
  const [events, outbox] = await Promise.all([
    db.$executeRaw`DELETE FROM "EmailWebhookEvent" WHERE "processedAt" IS NOT NULL AND "createdAt" < ${cutoff}`,
    db.$executeRaw`DELETE FROM "EmailOutbox" WHERE "status" IN ('SENT','FAILED') AND "updatedAt" < ${cutoff}`,
  ])
  return { events, outbox }
}
