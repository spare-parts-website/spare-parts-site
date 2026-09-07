import { after } from 'next/server'
import { db } from '@/lib/db'
import { notificationEmailHtml } from '@/lib/email-templates'
import { applicationOrigin } from '@/lib/application-url'
import { normalizeRecipientEmail, shouldSendNonessentialEmail } from '@/lib/email-deliverability'
import { getTransactionalSender } from '@/lib/email-sender'
import { processEmailOutboxBatch, queueEmailOutbox } from '@/lib/email-outbox'

function notificationActionUrl(link: string | undefined) {
  const origin = process.env.NODE_ENV === 'production' ? 'https://ghyarmarket-eg.com' : applicationOrigin()
  const fallback = new URL('/account/profile', origin).toString()
  if (!link) return fallback
  try {
    const requested = new URL(link, origin)
    return requested.origin === origin ? requested.toString() : fallback
  } catch {
    return fallback
  }
}

function scheduleOutboxDelivery() {
  try {
    after(async () => {
      try { await processEmailOutboxBatch(8) }
      catch (error) { console.error('Email outbox post-response worker failed', error instanceof Error ? error.message : 'unknown') }
    })
  } catch {
    // If createNotification is ever called outside a Next request scope, the
    // durable row remains queued for the authenticated daily maintenance job.
  }
}

export async function createNotification(input: {
  userId: string
  title: string
  message: string
  type?: string
  link?: string
  /** Stable event key used to make retried notification triggers idempotent. */
  dedupeKey?: string
}) {
  const data = {
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type || 'SYSTEM',
    link: input.link || null,
    dedupeKey: input.dedupeKey?.trim().slice(0, 180) || null,
  }
  const notification = data.dedupeKey
    ? await db.notification.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} })
    : await db.notification.create({ data })

  // Provider I/O is no longer part of the marketplace request. Queue the
  // message durably, return, and let Next `after()`/daily maintenance deliver it.
  const from = getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL)
  if (from) {
    const recipient = await db.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailNotifications: true, emailDeliveryStatus: true },
    })
    if (recipient?.email && recipient.emailNotifications && shouldSendNonessentialEmail(recipient.emailDeliveryStatus)) {
      const recipientEmail = normalizeRecipientEmail(recipient.email)
      const actionUrl = notificationActionUrl(input.link)
      const deliveryKey = `notification/${notification.id}`
      await queueEmailOutbox({
        deliveryKey,
        category: 'NOTIFICATION',
        notificationId: notification.id,
        recipientUserId: input.userId,
        recipientEmail,
        fromEmail: from,
        subject: `غيار ماركت: ${input.title}`,
        text: `${input.title}\n\n${input.message}\n\nعرض التفاصيل: ${actionUrl}\n\nيمكنك إدارة إشعارات البريد من صفحة ملفك الشخصي في غيار ماركت.`,
        html: notificationEmailHtml({ ...input, link: actionUrl }),
      })
      scheduleOutboxDelivery()
    }
  }

  return notification
}
