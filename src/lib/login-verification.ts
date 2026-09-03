import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { loginCodeEmailHtml } from '@/lib/email-templates'
import { getTransactionalSender } from '@/lib/email-sender'
import { isPermanentRecipientStatus, normalizeRecipientEmail } from '@/lib/email-deliverability'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000
export const LOGIN_CODE_MAX_ATTEMPTS = 15

function verificationSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production')
  }
  return 'local-development-only-change-me'
}


function hashCode(challengeId: string, code: string) {
  return createHmac('sha256', verificationSecret())
    .update(`${challengeId}:${code}`)
    .digest('hex')
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

async function sendCodeEmail(input: { userId: string; email: string; name: string; code: string; challengeId: string; purpose?: 'login' | 'register' }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = getTransactionalSender(process.env.AUTH_FROM_EMAIL, process.env.NOTIFICATION_FROM_EMAIL)
  if (!apiKey || !from) throw new Error('Email verification is not configured')

  const isRegister = input.purpose === 'register'
  const subject = isRegister
    ? 'رمز تأكيد البريد الإلكتروني في غيار ماركت'
    : 'رمز التحقق لتسجيل الدخول إلى غيار ماركت'
  const text = isRegister
    ? `مرحباً ${input.name}\n\nرمز تأكيد بريدك الإلكتروني وتفعيل الحساب هو: ${input.code}\n\nينتهي الرمز خلال 10 دقائق. إذا لم تنشئ حساباً، تجاهل هذه الرسالة.`
    : `مرحباً ${input.name}\n\nرمز التحقق الخاص بك هو: ${input.code}\n\nينتهي الرمز خلال 10 دقائق. إذا لم تحاول تسجيل الدخول، تجاهل هذه الرسالة.`

  const resend = new Resend(apiKey)
  const result = await resend.emails.send(
    {
      from: `غيار ماركت <${from}>`,
      to: input.email,
      subject,
      text,
      html: loginCodeEmailHtml({ name: input.name, code: input.code, purpose: input.purpose }),
    },
    { idempotencyKey: `login-code/${input.challengeId}` },
  )

  if (result.error) throw new Error(`Resend error: ${result.error.message}`)
  try {
    await recordEmailDeliveryAttempt({ deliveryKey: `login-code/${input.challengeId}`, category: 'AUTHENTICATION', recipientUserId: input.userId, recipientEmail: normalizeRecipientEmail(input.email), providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    // Delivery auditing must never invalidate a successfully issued login code.
    console.error('Login email delivery audit failed', error instanceof Error ? error.message.slice(0, 300) : 'unknown error')
  }
}

export async function issueLoginVerification(
  user: { id: string; email: string; name: string; emailDeliveryStatus?: string | null },
  purpose: 'login' | 'register' = 'login',
) {
  if (isPermanentRecipientStatus(user.emailDeliveryStatus)) throw new Error('EMAIL_UNDELIVERABLE')
  const id = randomUUID()
  const code = String(randomInt(1000, 10000))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOGIN_CODE_TTL_MS)

  await db.$transaction([
    db.loginVerification.updateMany({
      where: { userId: user.id, verifiedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    db.loginVerification.create({
      data: { id, userId: user.id, codeHash: hashCode(id, code), expiresAt },
    }),
  ])

  try {
    await sendCodeEmail({ userId: user.id, email: user.email, name: user.name, code, challengeId: id, purpose })
  } catch (error) {
    try {
      await recordEmailDeliveryAttempt({ deliveryKey: `login-code/${id}`, category: 'AUTHENTICATION', recipientUserId: user.id, recipientEmail: normalizeRecipientEmail(user.email), status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 300) : 'provider error' })
    } catch (auditError) {
      console.error('Login email failure audit failed', auditError instanceof Error ? auditError.message.slice(0, 300) : 'unknown error')
    }
    await db.loginVerification.deleteMany({ where: { id } })
    throw error
  }

  return { challengeId: id, emailHint: maskEmail(user.email), expiresIn: LOGIN_CODE_TTL_MS / 1000 }
}

export function matchesLoginCode(challengeId: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashCode(challengeId, code), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
