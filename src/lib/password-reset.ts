import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { passwordResetEmailHtml } from '@/lib/email-templates'
import { applicationOrigin } from '@/lib/application-url'
import { getTransactionalSender } from '@/lib/email-sender'
import { isPermanentRecipientStatus, normalizeRecipientEmail } from '@/lib/email-deliverability'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000
export const PASSWORD_RESET_MAX_ATTEMPTS = 5

function resetSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'local-development-only-change-me'
}

function hashToken(id: string, token: string) {
  return createHmac('sha256', resetSecret()).update(`${id}:${token}`).digest('hex')
}

export function matchesPasswordResetToken(id: string, token: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(id, token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function parsePasswordResetToken(value: unknown) {
  if (typeof value !== 'string') return null
  const [id, token, extra] = value.split('.')
  if (extra || !/^[0-9a-f-]{36}$/i.test(id || '') || !/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null
  return { id, token }
}

async function sendPasswordResetEmail(input: { userId: string; email: string; name: string; resetUrl: string; resetId: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = getTransactionalSender(process.env.AUTH_FROM_EMAIL, process.env.NOTIFICATION_FROM_EMAIL)
  if (!apiKey || !from) throw new Error('Password reset email is not configured')
  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from: `غيار ماركت <${from}>`,
    to: input.email,
    subject: 'استعادة كلمة مرور غيار ماركت',
    text: `مرحباً ${input.name}\n\nاستخدم الرابط التالي لتعيين كلمة مرور جديدة:\n${input.resetUrl}\n\nينتهي الرابط خلال 30 دقيقة ويعمل مرة واحدة فقط.`,
    html: passwordResetEmailHtml({ name: input.name, resetUrl: input.resetUrl }),
  }, { idempotencyKey: `password-reset/${input.resetId}` })
  if (result.error) throw new Error(`Resend error: ${result.error.message}`)
  try {
    await recordEmailDeliveryAttempt({ deliveryKey: `password-reset/${input.resetId}`, category: 'AUTHENTICATION', recipientUserId: input.userId, recipientEmail: normalizeRecipientEmail(input.email), providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    // The reset flow remains successful even if its audit write is unavailable.
    console.error('Password reset delivery audit failed', error instanceof Error ? error.message.slice(0, 300) : 'unknown error')
  }
}

export async function issuePasswordReset(user: { id: string; email: string; name: string; emailDeliveryStatus?: string | null }) {
  if (isPermanentRecipientStatus(user.emailDeliveryStatus)) throw new Error('EMAIL_UNDELIVERABLE')
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS)

  await db.$transaction([
    db.passwordReset.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
    db.passwordReset.create({ data: { id, userId: user.id, codeHash: hashToken(id, token), expiresAt } }),
  ])

  const resetUrl = `${applicationOrigin()}/reset-password?token=${encodeURIComponent(`${id}.${token}`)}`
  try {
    await sendPasswordResetEmail({ userId: user.id, email: user.email, name: user.name, resetUrl, resetId: id })
  } catch (error) {
    try {
      await recordEmailDeliveryAttempt({ deliveryKey: `password-reset/${id}`, category: 'AUTHENTICATION', recipientUserId: user.id, recipientEmail: normalizeRecipientEmail(user.email), status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 300) : 'provider error' })
    } catch (auditError) {
      console.error('Password reset failure audit failed', auditError instanceof Error ? auditError.message.slice(0, 300) : 'unknown error')
    }
    await db.passwordReset.deleteMany({ where: { id } })
    throw error
  }
}
