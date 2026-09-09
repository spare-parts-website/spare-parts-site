import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, verifyPassword } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { issueLoginVerification } from '@/lib/login-verification'
import { createAdminLoginChallenge, ADMIN_MFA_CHALLENGE_TTL_MS } from '@/lib/admin-mfa'

function emailHint(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}

export async function POST(req: NextRequest) {
  try {
    // Coarse IP bursts are rejected in Proxy before this handler. Keep only the
    // durable per-account counter in Postgres so brute-force state survives
    // serverless instance rotation without writing one DB row per random IP hit.
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, { status: 400 })
    const accountLimit = await rateLimit(`login:account:${email}`, 8, 15 * 60 * 1000)
    if (!accountLimit.allowed) return NextResponse.json({ error: 'محاولات كثيرة لهذا الحساب. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfter) } })

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.password))) return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 401 })

    if (user.role === 'ADMIN') {
      await createSession({ id: user.id, name: user.name, email: user.email, role: 'ADMIN', phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt, sessionVersion: user.sessionVersion }, req)
      return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt } })
    }

    if (user.adminMfaEnabledAt && user.adminMfaSecret) {
      const challenge = await createAdminLoginChallenge(user.id)
      return NextResponse.json({ mfaRequired: true, challengeId: challenge.id, expiresIn: Math.floor(ADMIN_MFA_CHALLENGE_TTL_MS / 1000) })
    }

    const purpose = user.emailVerifiedAt ? 'login' : 'register'
    const challenge = await issueLoginVerification(user, purpose)
    return NextResponse.json({ verificationRequired: true, challengeId: challenge.challengeId, emailHint: emailHint(user.email), expiresIn: 600 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'EMAIL_UNDELIVERABLE') return NextResponse.json({ error: 'هذا البريد لا يستطيع استلام رسائل التحقق حالياً. تواصل مع الدعم لتحديث البريد الإلكتروني.' }, { status: 409 })
    if (message === 'EMAIL_NOT_CONFIGURED' || message === 'EMAIL_DELIVERY_FAILED') return NextResponse.json({ error: 'تعذر إرسال رمز التحقق الآن. حاول مرة أخرى بعد قليل.' }, { status: 503 })
    console.error('Login failed', error)
    return NextResponse.json({ error: 'تعذر تسجيل الدخول' }, { status: 500 })
  }
}
