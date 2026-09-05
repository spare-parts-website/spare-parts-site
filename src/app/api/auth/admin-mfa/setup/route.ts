import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ADMIN_MFA_ENROLL_TTL_MS, adminMfaEnrollmentDetails, encryptAdminMfaSecret, generateAdminMfaSecret } from '@/lib/admin-mfa'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`admin-mfa-setup:${requestAddress(req)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const bootstrapChallengeId = typeof body.bootstrapChallengeId === 'string' ? body.bootstrapChallengeId.trim() : ''
    const bootstrap = await db.loginVerification.findUnique({ where: { id: bootstrapChallengeId }, include: { user: true } })
    if (!bootstrap || bootstrap.purpose !== 'ADMIN_BOOTSTRAP' || !bootstrap.verifiedAt || bootstrap.expiresAt <= new Date() || bootstrap.user.role !== 'ADMIN') return NextResponse.json({ error: 'انتهت صلاحية خطوة إعداد المصادقة. سجل الدخول من جديد.' }, { status: 410 })
    if (bootstrap.user.adminMfaEnabledAt) return NextResponse.json({ error: 'المصادقة متعددة العوامل مفعلة بالفعل' }, { status: 409 })

    const secret = generateAdminMfaSecret()
    const secretEncrypted = encryptAdminMfaSecret(secret)
    const enrollment = await db.$transaction(async (tx) => {
      const consumed = await tx.loginVerification.updateMany({ where: { id: bootstrap.id, purpose: 'ADMIN_BOOTSTRAP', verifiedAt: { not: null }, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } })
      if (consumed.count !== 1) throw new Error('BOOTSTRAP_USED')
      return tx.adminMfaChallenge.create({ data: { userId: bootstrap.userId, purpose: 'ENROLL', secretEncrypted, expiresAt: new Date(Date.now() + ADMIN_MFA_ENROLL_TTL_MS) } })
    })
    return NextResponse.json({ enrollmentId: enrollment.id, ...adminMfaEnrollmentDetails(secret, bootstrap.user.email), expiresIn: Math.floor(ADMIN_MFA_ENROLL_TTL_MS / 1000) })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOTSTRAP_USED') return NextResponse.json({ error: 'تم استخدام خطوة الإعداد. سجل الدخول من جديد.' }, { status: 409 })
    console.error('Admin MFA setup failed', error)
    return NextResponse.json({ error: 'تعذر بدء إعداد المصادقة' }, { status: 500 })
  }
}
