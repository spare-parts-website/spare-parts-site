import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession } from '@/lib/auth'
import { ADMIN_MFA_MAX_ATTEMPTS, decryptAdminMfaSecret, generateRecoveryCodes, verifyTotpCode } from '@/lib/admin-mfa'
import { audit } from '@/lib/audit'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`admin-mfa-confirm:${requestAddress(req)}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const enrollmentId = typeof body.enrollmentId === 'string' ? body.enrollmentId.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!enrollmentId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'أدخل رمز تطبيق المصادقة المكون من 6 أرقام' }, { status: 400 })
    const challenge = await db.adminMfaChallenge.findUnique({ where: { id: enrollmentId }, include: { user: true } })
    if (!challenge || challenge.purpose !== 'ENROLL' || !challenge.secretEncrypted || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.user.role !== 'ADMIN') return NextResponse.json({ error: 'انتهت صلاحية إعداد المصادقة. سجل الدخول من جديد.' }, { status: 410 })
    if (challenge.attempts >= ADMIN_MFA_MAX_ATTEMPTS) return NextResponse.json({ error: 'تم تجاوز عدد المحاولات. سجل الدخول من جديد.' }, { status: 429 })
    const claimed = await db.adminMfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: ADMIN_MFA_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } })
    if (claimed.count !== 1) return NextResponse.json({ error: 'طلب الإعداد لم يعد صالحاً' }, { status: 409 })
    const secret = decryptAdminMfaSecret(challenge.secretEncrypted)
    const counter = verifyTotpCode(secret, code)
    if (counter === null) return NextResponse.json({ error: 'رمز تطبيق المصادقة غير صحيح' }, { status: 400 })
    const recovery = generateRecoveryCodes()
    const now = new Date()
    const user = await db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`admin-mfa:${challenge.userId}`}))`
      const consumed = await tx.adminMfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now } })
      if (consumed.count !== 1) throw new Error('ENROLLMENT_USED')
      return tx.user.update({
        where: { id: challenge.userId },
        data: { adminMfaSecret: challenge.secretEncrypted, adminMfaEnabledAt: now, adminMfaRecoveryCodes: JSON.stringify(recovery.hashes), adminMfaLastCounter: counter, emailVerifiedAt: now, sessionVersion: { increment: 1 } },
      })
    })
    const mfaVerifiedAt = Date.now()
    await createSession({ id: user.id, name: user.name, email: user.email, role: 'ADMIN', phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications, emailDeliveryStatus: user.emailDeliveryStatus, emailDeliveryReason: user.emailDeliveryReason, emailDeliveryAt: user.emailDeliveryAt, sessionVersion: user.sessionVersion, mfaVerifiedAt })
    await audit({ actorId: user.id, action: 'ADMIN_MFA_ENROLLED', targetType: 'user', targetId: user.id })
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, emailNotifications: user.emailNotifications }, recoveryCodes: recovery.codes })
  } catch (error) {
    if (error instanceof Error && error.message === 'ENROLLMENT_USED') return NextResponse.json({ error: 'تم استخدام إعداد المصادقة بالفعل' }, { status: 409 })
    console.error('Admin MFA confirmation failed', error)
    return NextResponse.json({ error: 'تعذر تفعيل المصادقة متعددة العوامل' }, { status: 500 })
  }
}
