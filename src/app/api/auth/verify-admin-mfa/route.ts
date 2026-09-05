import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession } from '@/lib/auth'
import { ADMIN_MFA_MAX_ATTEMPTS, verifyAndConsumeAdminMfa } from '@/lib/admin-mfa'
import { audit } from '@/lib/audit'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`verify-admin-mfa:${requestAddress(req)}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!challengeId || !code) return NextResponse.json({ error: 'رمز المصادقة مطلوب' }, { status: 400 })
    const challenge = await db.adminMfaChallenge.findUnique({ where: { id: challengeId }, include: { user: true } })
    if (!challenge || challenge.purpose !== 'LOGIN' || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.user.role !== 'ADMIN') return NextResponse.json({ error: 'انتهت صلاحية محاولة تسجيل الدخول. أعد المحاولة.' }, { status: 410 })
    if (challenge.attempts >= ADMIN_MFA_MAX_ATTEMPTS) return NextResponse.json({ error: 'تم تجاوز عدد محاولات المصادقة' }, { status: 429 })
    const claimed = await db.adminMfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: ADMIN_MFA_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } })
    if (claimed.count !== 1) return NextResponse.json({ error: 'طلب المصادقة لم يعد صالحاً' }, { status: 409 })
    let method: 'totp' | 'recovery'
    try { method = (await verifyAndConsumeAdminMfa(challenge.userId, code)).method } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_MFA_CODE') return NextResponse.json({ error: 'رمز المصادقة غير صحيح' }, { status: 400 })
      throw error
    }
    await db.adminMfaChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
    const user = await db.user.findUniqueOrThrow({ where: { id: challenge.userId } })
    const mfaVerifiedAt = Date.now()
    await createSession({ id: user.id, name: user.name, email: user.email, role: 'ADMIN', phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt, sessionVersion: user.sessionVersion, mfaVerifiedAt })
    await audit({ actorId: user.id, action: 'ADMIN_MFA_LOGIN_VERIFIED', targetType: 'user', targetId: user.id, metadata: { method } })
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications } })
  } catch (error) {
    console.error('Admin MFA login failed', error)
    return NextResponse.json({ error: 'تعذر تأكيد المصادقة' }, { status: 500 })
  }
}
