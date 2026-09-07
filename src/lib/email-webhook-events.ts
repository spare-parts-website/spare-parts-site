import 'server-only'

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { isPermanentRecipientStatus, normalizeRecipientEmail, sanitizeDeliveryReason } from '@/lib/email-deliverability'
import { shouldApplyDeliveryStatus, type DeliveryStatus, type ParsedDeliveryEvent } from '@/lib/resend-webhook'

type StoredWebhookEvent = {
  id: string
  webhookId: string
  providerId: string
  eventType: string
  status: DeliveryStatus
  error: string | null
  occurredAt: Date | null
}

export async function persistAndReconcileWebhookEvent(webhookId: string, event: ParsedDeliveryEvent) {
  const inserted = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "EmailWebhookEvent" ("id", "webhookId", "providerId", "eventType", "status", "error", "occurredAt", "createdAt")
    VALUES (${randomUUID()}, ${webhookId}, ${event.providerId}, ${event.eventType}, ${event.status}, ${event.error}, ${event.occurredAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("webhookId") DO NOTHING
    RETURNING "id"
  `
  if (!inserted.length) return { duplicate: true as const, matched: true, applied: [] as string[] }
  const result = await reconcileWebhookEvents(event.providerId)
  return { duplicate: false as const, matched: result.matched, applied: result.applied }
}

export async function reconcileWebhookEvents(providerId: string) {
  const events = await db.$queryRaw<StoredWebhookEvent[]>`
    SELECT "id", "webhookId", "providerId", "eventType", "status", "error", "occurredAt"
    FROM "EmailWebhookEvent"
    WHERE "providerId" = ${providerId} AND "processedAt" IS NULL
    ORDER BY "occurredAt" ASC NULLS LAST, "createdAt" ASC
    LIMIT 50
  `
  if (!events.length) return { matched: false, applied: [] as string[] }

  const attempt = await db.emailDeliveryAttempt.findFirst({ where: { providerId }, select: { id: true } })
  if (!attempt) return { matched: false, applied: [] as string[] }

  const appliedStatuses: string[] = []
  for (const event of events) {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`email-provider:${providerId}`}))`
      const current = await tx.emailDeliveryAttempt.findFirst({
        where: { providerId },
        include: { notification: { select: { userId: true } } },
      })
      if (!current) return { kind: 'unmatched' as const, attemptId: '' }

      const finishEvent = () => tx.$executeRaw`
        UPDATE "EmailWebhookEvent" SET "processedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${event.id} AND "processedAt" IS NULL
      `

      if (current.lastEventId === event.webhookId) {
        await finishEvent()
        return { kind: 'duplicate' as const, attemptId: current.id }
      }
      if (current.lastEventAt && event.occurredAt && event.occurredAt < current.lastEventAt) {
        await finishEvent()
        return { kind: 'stale' as const, attemptId: current.id }
      }
      if (!shouldApplyDeliveryStatus(current.status, event.status)) {
        await finishEvent()
        return { kind: 'stale' as const, attemptId: current.id }
      }

      await tx.emailDeliveryAttempt.update({
        where: { id: current.id },
        data: { status: event.status, error: sanitizeDeliveryReason(event.error), lastEventId: event.webhookId, lastEventAt: event.occurredAt },
      })

      const recipientUserId = current.recipientUserId || current.notification?.userId
      if (isPermanentRecipientStatus(event.status) && recipientUserId && current.recipientEmail) {
        const recipient = await tx.user.findUnique({ where: { id: recipientUserId }, select: { id: true, email: true } })
        if (recipient && normalizeRecipientEmail(recipient.email) === normalizeRecipientEmail(current.recipientEmail)) {
          await tx.user.update({
            where: { id: recipient.id },
            data: { emailDeliveryStatus: event.status, emailDeliveryReason: sanitizeDeliveryReason(event.error), emailDeliveryAt: event.occurredAt || new Date() },
          })
        }
      }
      await finishEvent()
      return { kind: 'matched' as const, attemptId: current.id }
    })

    if (result.kind === 'matched') {
      appliedStatuses.push(event.status)
      if (['BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'].includes(event.status)) {
        await audit({ actorId: null, action: `EMAIL_${event.status}`, targetType: 'email_delivery', targetId: result.attemptId, metadata: { eventType: event.eventType } })
      }
    }
  }
  return { matched: true, applied: appliedStatuses }
}
