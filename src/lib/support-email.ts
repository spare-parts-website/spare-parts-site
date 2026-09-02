import 'server-only'

import { Resend } from 'resend'
import { notificationEmailHtml } from '@/lib/email-templates'
import { applicationOrigin } from '@/lib/application-url'
import { getTransactionalSender, isValidEmailAddress } from '@/lib/email-sender'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

type SupportEmailInput = {
  ticketId: string
  category: string
  subject: string
  message: string
  userName: string
  userEmail?: string | null
}

function safePreview(value: string, max: number) {
  return value.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, max)
}

export async function sendSupportTicketEmail(input: SupportEmailInput) {
  const to = process.env.SUPPORT_EMAIL?.trim()
  const from = getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL)
  if (!to) return { sent: false as const, reason: 'SUPPORT_EMAIL_NOT_CONFIGURED' as const }
  if (!process.env.RESEND_API_KEY || !from) return { sent: false as const, reason: 'RESEND_NOT_CONFIGURED' as const }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const origin = process.env.NODE_ENV === 'production' ? 'https://ghyarmarket-eg.com' : applicationOrigin()
  const link = new URL(`/admin/support?ticket=${encodeURIComponent(input.ticketId)}`, origin).toString()
  const preview = safePreview(input.message, 500)
  const text = [
    `تذكرة دعم جديدة: ${input.subject}`,
    `رقم التذكرة: ${input.ticketId}`,
    `التصنيف: ${input.category}`,
    `المستخدم: ${safePreview(input.userName, 120)}${input.userEmail ? ` (${safePreview(input.userEmail, 160)})` : ''}`,
    '',
    preview,
    '',
    `فتح التذكرة: ${link}`,
  ].join('\n')
  const result = await resend.emails.send({
    from: `غيار ماركت للدعم <${from}>`,
    to,
    subject: `تذكرة دعم جديدة: ${safePreview(input.subject, 120)}`,
    text,
    html: notificationEmailHtml({
      title: 'تذكرة دعم جديدة',
      message: `#${input.ticketId}\n${input.category} — ${input.subject}\n${safePreview(input.userName, 120)}${input.userEmail ? ` (${safePreview(input.userEmail, 160)})` : ''}\n\n${preview}`,
      link,
    }),
    ...(input.userEmail && isValidEmailAddress(input.userEmail) ? { replyTo: input.userEmail.trim().toLowerCase() } : {}),
  }, { idempotencyKey: `support-ticket/${input.ticketId}` })
  if (result.error) {
    const error = new Error(result.error.message)
    try {
      await recordEmailDeliveryAttempt({ deliveryKey: `support-ticket/${input.ticketId}`, category: 'SUPPORT', recipientEmail: to, status: 'FAILED', error: error.message.slice(0, 300) })
    } catch (auditError) {
      console.error('Support email failure audit failed', auditError instanceof Error ? auditError.message.slice(0, 300) : 'unknown error')
    }
    throw error
  }
  try {
    await recordEmailDeliveryAttempt({ deliveryKey: `support-ticket/${input.ticketId}`, category: 'SUPPORT', recipientEmail: to, providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    console.error('Support email delivery audit failed', error instanceof Error ? error.message.slice(0, 300) : 'unknown error')
  }
  return { sent: true as const, providerId: result.data?.id || null }
}
