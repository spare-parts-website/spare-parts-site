import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { db } from '@/lib/db'

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000
export const LOGIN_CODE_MAX_ATTEMPTS = 5

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

async function sendCodeEmail(input: { email: string; name: string; code: string; challengeId: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL
  if (!apiKey || !from) throw new Error('Email verification is not configured')

  const resend = new Resend(apiKey)
  const safeName = escapeHtml(input.name)
  const { error } = await resend.emails.send(
    {
      from: `غيار ماركت <${from}>`,
      to: input.email,
      subject: 'رمز التحقق لتسجيل الدخول إلى غيار ماركت',
      text: `مرحباً ${input.name}\n\nرمز التحقق الخاص بك هو: ${input.code}\n\nينتهي الرمز خلال 10 دقائق. إذا لم تحاول تسجيل الدخول، تجاهل هذه الرسالة.`,
      html: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f3f6f8;padding:24px;font-family:Arial,sans-serif;color:#0b1f33"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dce5eb;border-radius:18px;overflow:hidden"><div style="background:#06243d;padding:24px;text-align:center"><div style="font-size:24px;font-weight:800;color:#ffffff">غيار ماركت</div><div style="margin-top:6px;color:#46e6a8;font-size:14px">تأكيد تسجيل الدخول</div></div><div style="padding:30px;text-align:right"><h1 style="font-size:22px;margin:0 0 12px">مرحباً ${safeName}</h1><p style="font-size:15px;line-height:1.8;color:#526373;margin:0">استخدم الرمز التالي لإكمال تسجيل الدخول إلى حسابك:</p><div dir="ltr" style="margin:24px 0;text-align:center;font-size:38px;font-weight:900;letter-spacing:14px;color:#06243d;background:#eefbf6;border:1px solid #9ee8cb;border-radius:14px;padding:18px 10px">${input.code}</div><p style="font-size:14px;line-height:1.8;color:#526373;margin:0">ينتهي هذا الرمز خلال 10 دقائق ويمكن استخدامه مرة واحدة فقط.</p><p style="font-size:13px;line-height:1.7;color:#7b8792;margin:20px 0 0">إذا لم تحاول تسجيل الدخول، تجاهل هذه الرسالة ولا تشارك الرمز مع أي شخص.</p></div></div></body></html>`,
    },
    { headers: { 'Idempotency-Key': `login-code-${input.challengeId}` } },
  )

  if (error) throw new Error(`Resend error: ${error.message}`)
}

export async function issueLoginVerification(user: { id: string; email: string; name: string }) {
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
    await sendCodeEmail({ email: user.email, name: user.name, code, challengeId: id })
  } catch (error) {
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
