import 'server-only'

import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { loginCodeEmailHtml } from '@/lib/email-templates'
import { getTransactionalSender } from '@/lib/email-sender'
import { normalizeRecipientEmail } from '@/lib/email-deliverability'
import { recordEmailDeliveryAttempt } from '@/lib/email-delivery'

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000
export const LOGIN_CODE_MAX_ATTEMPTS = 5
export type LoginVerificationPurpose = 'login' | 'register' | 'admin-bootstrap'

type VerificationUser = { id: string; name: string; email: string }

function purposeDbValue(purpose: LoginVerificationPurpose) {
  return purpose === 'register' ? 'REGISTER' : purpose === 'admin-bootstrap' ? 'ADMIN_BOOTSTRAP' : 'LOGIN'
}

export function purposeFromDb(value: string): LoginVerificationPurpose {
  return value === 'REGISTER' ? 'register' : value === 'ADMIN_BOOTSTRAP' ? 'admin-bootstrap' : 'login'
}

function authSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'local-development-login-code'
}

function hashCode(challengeId: string, code: string) {
  return createHmac('sha256', authSecret()).update(`login-verification:${challengeId}:${code}`).digest('hex')
}

export function matchesLoginCode(challengeId: string, code: string, storedHash: string) {
  const expected = Buffer.from(hashCode(challengeId, code))
  const actual = Buffer.from(storedHash)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function issueLoginVerification(user: VerificationUser, purpose: LoginVerificationPurpose = 'login') {
  const challengeId = randomUUID()
  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS)
  const dbPurpose = purposeDbValue(purpose)
  await db.$transaction(async (tx) => {
    await tx.loginVerification.updateMany({
      where: { userId: user.id, verifiedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    })
    await tx.loginVerification.create({ data: { id: challengeId, userId: user.id, purpose: dbPurpose, codeHash: hashCode(challengeId, code), expiresAt } })
  })

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const from = getTransactionalSender(process.env.AUTH_FROM_EMAIL, process.env.NOTIFICATION_FROM_EMAIL)
  if (!resend || !from) {
    await db.loginVerification.delete({ where: { id: challengeId } }).catch(() => undefined)
    throw new Error('EMAIL_NOT_CONFIGURED')
  }

  const to = normalizeRecipientEmail(user.email)
  const title = purpose === 'register' ? 'تأكيد بريدك الإلكتروني' : purpose === 'admin-bootstrap' ? 'تأكيد أمان حساب المدير' : 'رمز تسجيل الدخول'
  const text = purpose === 'register'
    ? `مرحباً ${user.name}\n\nرمز تأكيد البريد الإلكتروني في غيار ماركت: ${code}\n\nينتهي الرمز خلال 10 دقائق ويمكن استخدامه مرة واحدة.`
    : purpose === 'admin-bootstrap'
      ? `مرحباً ${user.name}\n\nرمز تأكيد أمان حساب المدير في غيار ماركت: ${code}\n\nبعد هذا الرمز سيطلب منك إعداد تطبيق مصادقة. ينتهي الرمز خلال 10 دقائق.`
      : `مرحباً ${user.name}\n\nرمز تسجيل الدخول إلى غيار ماركت: ${code}\n\nينتهي الرمز خلال 10 دقائق ويمكن استخدامه مرة واحدة.`
  const deliveryKey = `login-verification/${challengeId}`
  try {
    const result = await resend.emails.send({
      from: `غيار ماركت <${from}>`, to, subject: `غيار ماركت: ${title}`, text,
      html: loginCodeEmailHtml({ name: user.name, code, purpose }),
    }, { idempotencyKey: deliveryKey })
    if (result.error) throw new Error(result.error.message)
    await recordEmailDeliveryAttempt({ deliveryKey, category: 'AUTHENTICATION', recipientUserId: user.id, recipientEmail: to, providerId: result.data?.id || null, status: 'SENT' })
  } catch (error) {
    await db.loginVerification.delete({ where: { id: challengeId } }).catch(() => undefined)
    const message = error instanceof Error ? error.message.slice(0, 300) : 'email provider failed'
    await recordEmailDeliveryAttempt({ deliveryKey, category: 'AUTHENTICATION', recipientUserId: user.id, recipientEmail: to, status: 'FAILED', error: message }).catch(() => undefined)
    throw new Error('EMAIL_DELIVERY_FAILED')
  }
  return { challengeId, expiresAt }
}
