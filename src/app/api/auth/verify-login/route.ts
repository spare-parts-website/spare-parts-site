import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { LOGIN_CODE_MAX_ATTEMPTS, matchesLoginCode } from '@/lib/login-verification'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`verify-login:${requestAddress(req)}`, 30, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json(); const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''; const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!challengeId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'أدخل رمز التحقق المكون من 6 أرقام' }, { status: 400 })
    const challenge = await db.loginVerification.findUnique({ where: { id: challengeId }, include: { user: true } })
    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= new Date()) return NextResponse.json({ error: 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.' }, { status: 410 })
    if (challenge.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return NextResponse.json({ error: 'تم تجاوز عدد محاولات الرمز. اطلب رمزاً جديداً.' }, { status: 429 })
    const claimed = await db.loginVerification.updateMany({ where: { id: challenge.id, verifiedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } })
    if (claimed.count !== 1) return NextResponse.json({ error: 'رمز التحقق لم يعد صالحاً.' }, { status: 409 })
    if (!matchesLoginCode(challenge.id, code, challenge.codeHash)) return NextResponse.json({ error: 'رمز التحقق غير صحيح' }, { status: 400 })
    const now = new Date()
    await db.$transaction(async (tx) => { const verified = await tx.loginVerification.updateMany({ where: { id: challenge.id, verifiedAt: null }, data: { verifiedAt: now } }); if (verified.count !== 1) throw new Error('CHALLENGE_USED'); if (challenge.purpose === 'REGISTER' || challenge.purpose === 'ADMIN_BOOTSTRAP') await tx.user.update({ where: { id: challenge.userId }, data: { emailVerifiedAt: now } }) })
    if (challenge.purpose === 'ADMIN_BOOTSTRAP') { if (challenge.user.role !== 'ADMIN') return NextResponse.json({ error: 'طلب التحقق غير صالح لهذا الحساب' }, { status: 403 }); await audit({ actorId: challenge.user.id, action: 'ADMIN_MFA_BOOTSTRAP_EMAIL_VERIFIED', targetType: 'user', targetId: challenge.user.id }); return NextResponse.json({ adminMfaSetupRequired: true, bootstrapChallengeId: challenge.id }) }
    const user = await db.user.findUniqueOrThrow({ where: { id: challenge.userId } })
    if (user.role === 'ADMIN') return NextResponse.json({ error: 'يلزم استخدام المصادقة متعددة العوامل لحساب المدير' }, { status: 403 })
    await createSession({ id: user.id, name: user.name, email: user.email, role: user.role as 'BUYER' | 'SHOP_OWNER', phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt, sessionVersion: user.sessionVersion }, req)
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt } })
  } catch (error) { if (error instanceof Error && error.message === 'CHALLENGE_USED') return NextResponse.json({ error: 'تم استخدام رمز التحقق بالفعل' }, { status: 409 }); console.error('Login verification failed', error); return NextResponse.json({ error: 'تعذر تأكيد رمز التحقق' }, { status: 500 }) }
}
