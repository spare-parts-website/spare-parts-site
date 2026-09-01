import { db } from '@/lib/db'
import { Resend } from 'resend'
import { notificationEmailHtml } from '@/lib/email-templates'
import { applicationOrigin } from '@/lib/application-url'

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
}) {
  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type || 'SYSTEM',
      link: input.link || null,
    },
  })

  // Email is an additional delivery channel. A provider failure must never
  // prevent the in-site notification from being saved and shown in the bell.
  const from = process.env.NOTIFICATION_FROM_EMAIL || process.env.AUTH_FROM_EMAIL
  if (resend && from) {
    try {
      const recipient = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, emailNotifications: true },
      })

      if (recipient?.email && recipient.emailNotifications) {
        const actionUrl = notificationActionUrl(input.link)
        const result = await resend.emails.send({
          from: `غيار ماركت <${from}>`,
          to: recipient.email,
          subject: `غيار ماركت: ${input.title}`,
          text: `${input.title}\n\n${input.message}\n\nعرض التفاصيل: ${actionUrl}\n\nيمكنك إدارة إشعارات البريد من صفحة ملفك الشخصي في غيار ماركت.`,
          html: notificationEmailHtml({ ...input, link: actionUrl }),
          tags: [{ name: 'notification_id', value: notification.id }],
        }, { idempotencyKey: `notification/${notification.id}` })
        if (result.error) throw new Error(result.error.message)
        await db.emailDeliveryAttempt.upsert({
          where: { notificationId: notification.id },
          create: { notificationId: notification.id, providerId: result.data?.id || null, status: 'SENT' },
          update: { providerId: result.data?.id || null, status: 'SENT', error: null },
        })
      }
    } catch (error) {
      console.error('Notification email error:', error)
      try {
        await db.emailDeliveryAttempt.upsert({
          where: { notificationId: notification.id },
          create: { notificationId: notification.id, status: 'FAILED', error: String(error).slice(0, 1000) },
          update: { status: 'FAILED', error: String(error).slice(0, 1000) },
        })
      } catch (recordError) {
        console.error('Notification delivery audit error:', recordError)
      }
    }
  }

  return notification
}
