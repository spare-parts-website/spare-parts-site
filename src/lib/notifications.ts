import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
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
  const recipient = await db.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true, emailNotifications: true } })
  if (recipient?.emailNotifications) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: input.title,
        text: `${input.title}\n\n${input.message}`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.message)}</p></div>`,
      })
    } catch (error) {
      console.error('Notification email error:', error)
    }
  }
  return notification
}
