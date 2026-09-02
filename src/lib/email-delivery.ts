import 'server-only'

import { db } from '@/lib/db'

export type EmailDeliveryCategory = 'NOTIFICATION' | 'AUTHENTICATION' | 'SUPPORT'
export type EmailDeliveryAttemptStatus = 'SENT' | 'DELAYED' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'COMPLAINED' | 'SUPPRESSED'

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
  return db.emailDeliveryAttempt.upsert({
    where: { deliveryKey },
    create: {
      deliveryKey,
      category: input.category,
      status: input.status,
      notificationId: input.notificationId || null,
      recipientUserId: input.recipientUserId || null,
      recipientEmail: input.recipientEmail || null,
      providerId: input.providerId || null,
      error: input.error || null,
    },
    update: {
      category: input.category,
      status: input.status,
      notificationId: input.notificationId || undefined,
      recipientUserId: input.recipientUserId || undefined,
      recipientEmail: input.recipientEmail || undefined,
      providerId: input.providerId || undefined,
      error: input.error || null,
    },
  })
}
