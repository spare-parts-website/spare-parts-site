import { db } from '@/lib/db'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
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
  const from = process.env.NOTIFICATION_FROM_EMAIL
  if (resend && from) {
    try {
      const recipient = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      })

      if (recipient?.email) {
        const title = escapeHtml(input.title)
        const message = escapeHtml(input.message)
        await resend.emails.send({
          from: `غيار ماركت <${from}>`,
          to: recipient.email,
          subject: input.title,
          text: `${input.title}\n\n${input.message}`,
          html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f6f7f9;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px"><h1 style="font-size:22px;margin:0 0 16px;color:#1565c0">${title}</h1><p style="font-size:16px;line-height:1.8;margin:0">${message}</p><p style="font-size:12px;color:#6b7280;margin:24px 0 0">هذه رسالة تلقائية من غيار ماركت.</p></div></body></html>`,
        })
      }
    } catch (error) {
      console.error('Notification email error:', error)
    }
  }

  return notification
}
