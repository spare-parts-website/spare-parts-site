import { db } from '@/lib/db'
import { Resend } from 'resend'
import { notificationEmailHtml } from '@/lib/email-templates'
import { applicationOrigin } from '@/lib/application-url'
import { normalizeRecipientEmail, shouldSendNonessentialEmail } from '@/lib/email-deliverability'
import { getTransactionalSender } from '@/lib/email-sender'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
    ? await db.notification.upsert({
      where: { dedupeKey: data.dedupeKey },
      create: data,
      // A retry must not create a second in-site or outbound notification.
      // Keep the original message as the audit-safe source of truth.
      update: {},
    })
    : await db.notification.create({ data })

  // Email is an additional delivery channel. A provider failure must never
  // prevent the in-site notification from being saved and shown in the bell.
  const from = getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL)
  let recipientEmail: string | null = null
  if (resend && from) {
    try {
      const recipient = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, emailNotifications: true, emailDeliveryStatus: true },
      })

      if (recipient?.email && recipient.emailNotifications && shouldSendNonessentialEmail(recipient.emailDeliveryStatus)) {
        recipientEmail = normalizeRecipientEmail(recipient.email)
        const actionUrl = notificationActionUrl(input.link)
        const result = await resend.emails.send({
          from: `غيار ماركت <${from}>`,
          to: recipientEmail,
          subject: `غيار ماركت: ${input.title}`,
          text: `${input.title}\n\n${input.message}\n\nعرض التفاصيل: ${actionUrl}\n\nيمكنك إدارة إشعارات البريد من صفحة ملفك الشخصي في غيار ماركت.`,
          html: notificationEmailHtml({ ...input, link: actionUrl }),
          tags: [{ name: 'notification_id', value: notification.id }],
        }, { idempotencyKey: `notification/${notification.id}` })
        if (result.error) throw new Error(result.error.message)
        await recordEmailDeliveryAttempt({ deliveryKey: `notification/${notification.id}`, category: 'NOTIFICATION', notificationId: notification.id, recipientUserId: input.userId, recipientEmail, providerId: result.data?.id || null, status: 'SENT' })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.slice(0, 300) : 'unknown provider error'
      console.error('Notification email error:', errorMessage)
      try {
        await recordEmailDeliveryAttempt({ deliveryKey: `notification/${notification.id}`, category: 'NOTIFICATION', notificationId: notification.id, recipientUserId: input.userId, recipientEmail, status: 'FAILED', error: errorMessage })
      } catch (recordError) {
        console.error('Notification delivery audit error:', recordError)
      }
    }
  }

  return notification
}
