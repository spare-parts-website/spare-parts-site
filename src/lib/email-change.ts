import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { emailChangeCodeHtml, accountSecurityEmailHtml } from '@/lib/email-templates'
import { getTransactionalSender } from '@/lib/email-sender'
import { normalizeRecipientEmail } from '@/lib/email-deliverability'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

export const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000
export const EMAIL_CHANGE_MAX_ATTEMPTS = 5

function secret() {
  const value = process.env.AUTH_SECRET
  if (value) return value
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'local-development-email-change'
}

function codeHash(requestId: string, code: string) {
  return createHmac('sha256', secret()).update(`email-change:${requestId}:${code}`).digest('hex')
}

export function matchesEmailChangeCode(requestId: string, code: string, stored: string) {
  const expected = Buffer.from(codeHash(requestId, code))
  const actual = Buffer.from(stored)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function issueEmailChange(input: { userId: string; name: string; oldEmail: string; targetEmail: string }) {
  const targetEmail = normalizeRecipientEmail(input.targetEmail)
  const id = crypto.randomUUID()
  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS)
  await db.emailChangeRequest.deleteMany({ where: { OR: [{ userId: input.userId }, { targetEmail }] } })
  await db.emailChangeRequest.create({ data: { id, userId: input.userId, targetEmail, codeHash: codeHash(id, code), expiresAt } })

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const from = getTransactionalSender(process.env.AUTH_FROM_EMAIL, process.env.NOTIFICATION_FROM_EMAIL)
  if (!resend || !from) {
    await db.emailChangeRequest.delete({ where: { id } }).catch(() => undefined)
    throw new Error('EMAIL_NOT_CONFIGURED')
  }
  const deliveryKey = `email-change/${id}`
  try {
    const result = await resend.emails.send({
      from: `غيار ماركت <${from}>`, to: targetEmail, subject: 'غيار ماركت: تأكيد البريد الإلكتروني الجديد',
      text: `مرحباً ${input.name}\n\nرمز تأكيد البريد الإلكتروني الجديد: ${code}\n\nينتهي الرمز خلال 10 دقائق. لن يتغير البريد قبل تأكيد الرمز.`,
      html: emailChangeCodeHtml({ name: input.name, code, targetEmail }),
    }, { idempotencyKey: deliveryKey })
    if (result.error) throw new Error(result.error.message)
    await recordEmailDeliveryAttempt({ deliveryKey, category: 'AUTHENTICATION', recipientUserId: input.userId, recipientEmail: targetEmail, providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    await db.emailChangeRequest.delete({ where: { id } }).catch(() => undefined)
    const message = error instanceof Error ? error.message.slice(0, 300) : 'email provider failed'
    await recordEmailDeliveryAttempt({ deliveryKey, category: 'AUTHENTICATION', recipientUserId: input.userId, recipientEmail: targetEmail, status: 'FAILED', error: message }).catch(() => undefined)
    throw new Error('EMAIL_DELIVERY_FAILED')
  }
  return { id, targetEmail, expiresAt }
}

export async function sendEmailChangedNotice(input: { userId: string; name: string; oldEmail: string; newEmail: string }) {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const from = getTransactionalSender(process.env.AUTH_FROM_EMAIL, process.env.NOTIFICATION_FROM_EMAIL)
  if (!resend || !from) return
  const to = normalizeRecipientEmail(input.oldEmail)
  const deliveryKey = `email-changed-notice/${input.userId}/${Date.now()}`
  try {
    const message = `تم تغيير بريد تسجيل الدخول لحسابك إلى ${input.newEmail}.`
    const result = await resend.emails.send({ from: `غيار ماركت <${from}>`, to, subject: 'غيار ماركت: تم تغيير بريد تسجيل الدخول', text: `${message}\n\nإذا لم تنفذ هذا التغيير، غيّر كلمة المرور وتواصل مع الدعم فوراً.`, html: accountSecurityEmailHtml({ name: input.name, title: 'تم تغيير بريد تسجيل الدخول', message }) }, { idempotencyKey: deliveryKey })
    if (result.error) throw new Error(result.error.message)
    await recordEmailDeliveryAttempt({ deliveryKey, category: 'AUTHENTICATION', recipientUserId: input.userId, recipientEmail: to, providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    console.error('Email-change security notice failed', error instanceof Error ? error.message : 'unknown')
  }
}
