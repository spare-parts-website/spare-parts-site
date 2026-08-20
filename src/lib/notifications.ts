import { db } from '@/lib/db'
import { Resend } from 'resend'
import { notificationEmailHtml } from '@/lib/email-templates'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
  const from = process.env.NOTIFICATION_FROM_EMAIL
  if (resend && from) {
    try {
      const recipient = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, emailNotifications: true },
      })

      if (recipient?.email && recipient.emailNotifications) {
        const result = await resend.emails.send({
          from: `غيار ماركت <${from}>`,
          to: recipient.email,
          subject: input.title,
          text: `${input.title}\n\n${input.message}`,
          html: notificationEmailHtml(input),
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
