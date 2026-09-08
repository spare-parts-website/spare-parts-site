import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ADMIN_MFA_ENROLL_TTL_MS, adminMfaEnrollmentDetails, encryptAdminMfaSecret, generateAdminMfaSecret } from '@/lib/admin-mfa'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.id }, select: { adminMfaEnabledAt: true, adminMfaSecret: true } })
  return NextResponse.json({ enabled: Boolean(user?.adminMfaEnabledAt && user.adminMfaSecret) })
}

export async function POST(req: NextRequest) {
  const limit = await rateLimit(`account-mfa-setup:${requestAddress(req)}`, 10, 15 * 60 * 1000)
  if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.id } })
  if (!user) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
  if (user.adminMfaEnabledAt || user.adminMfaSecret) return NextResponse.json({ error: 'المصادقة مفعلة بالفعل' }, { status: 409 })
  const secret = generateAdminMfaSecret()
  const challenge = await db.adminMfaChallenge.create({ data: { userId: user.id, purpose: 'ENROLL', secretEncrypted: encryptAdminMfaSecret(secret), expiresAt: new Date(Date.now() + ADMIN_MFA_ENROLL_TTL_MS) } })
  return NextResponse.json({ enrollmentId: challenge.id, ...adminMfaEnrollmentDetails(secret, user.email), expiresIn: Math.floor(ADMIN_MFA_ENROLL_TTL_MS / 1000) })
}
