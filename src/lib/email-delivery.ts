import 'server-only'

import { db } from '@/lib/db'
import { normalizeRecipientEmail, sanitizeDeliveryReason } from '@/lib/email-deliverability'
import { shouldApplyDeliveryStatus } from '@/lib/resend-webhook'

export type EmailDeliveryCategory = 'NOTIFICATION' | 'AUTHENTICATION' | 'SUPPORT'
export type EmailDeliveryAttemptStatus = 'PENDING' | 'SENT' | 'DELAYED' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'COMPLAINED' | 'SUPPRESSED'

/** Persist provider acceptance/failure without allowing an audit outage to break the user flow. */
export async function recordEmailDeliveryAttempt(input: {
  deliveryKey: string
  category: EmailDeliveryCategory
  status: EmailDeliveryAttemptStatus
  notificationId?: string | null
  recipientUserId?: string | null
  recipientEmail?: string | null
  providerId?: string | null
  error?: string | null
}) {
  const deliveryKey = input.deliveryKey.trim().slice(0, 180)
  if (!deliveryKey) return null
  const recipientEmail = input.recipientEmail ? normalizeRecipientEmail(input.recipientEmail) : null
  const error = sanitizeDeliveryReason(input.error)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${deliveryKey}))`
    const existing = await tx.emailDeliveryAttempt.findUnique({ where: { deliveryKey } })
    if (!existing) {
      return tx.emailDeliveryAttempt.create({
        data: {
          deliveryKey,
          category: input.category,
          status: input.status,
          notificationId: input.notificationId || null,
          recipientUserId: input.recipientUserId || null,
          recipientEmail,
          providerId: input.providerId || null,
          error,
        },
      })
    }

    const applyStatus = shouldApplyDeliveryStatus(existing.status, input.status)
    return tx.emailDeliveryAttempt.update({
      where: { deliveryKey },
      data: {
        category: input.category,
        status: applyStatus ? input.status : existing.status,
        notificationId: input.notificationId || undefined,
        recipientUserId: input.recipientUserId || undefined,
        recipientEmail: recipientEmail || undefined,
        providerId: input.providerId || undefined,
        ...(applyStatus ? { error } : {}),
      },
    })
  })
}
