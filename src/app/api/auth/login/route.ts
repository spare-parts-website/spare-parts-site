import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, verifyPassword } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { issueLoginVerification } from '@/lib/login-verification'
import { requiresLoginCode } from '@/lib/login-policy'

export async function POST(req: NextRequest) {
  try {
    const address = requestAddress(req)
    const addressLimit = await rateLimit(`login-v2:address:${address}`, 100, 15 * 60 * 1000)
    if (!addressLimit.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(addressLimit.retryAfter) } })
    }
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبة' }, { status: 400 })
    }
    const emailLimit = await rateLimit(`login-v2:email:${email}`, 30, 15 * 60 * 1000)
    if (!emailLimit.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة لهذا الحساب. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfter) } })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 400 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'بيانات الدخول غير صحيحة' }, { status: 400 })
    }

    if (!requiresLoginCode(user.role)) {
      await db.loginVerification.deleteMany({ where: { userId: user.id } })
      await createSession({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'ADMIN',
        phone: user.phone,
        avatar: user.avatar,
        emailNotifications: user.emailNotifications,
        emailDeliveryStatus: user.emailDeliveryStatus,
        sessionVersion: user.sessionVersion,
      })
      return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        emailNotifications: user.emailNotifications,
        emailDeliveryStatus: user.emailDeliveryStatus,
      })
    }

    try {
      const verification = await issueLoginVerification(user)
      return NextResponse.json({ verificationRequired: true, ...verification })
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_UNDELIVERABLE') {
        return NextResponse.json({ error: 'هذا البريد لا يستقبل رسائل التحقق حالياً. حدّث البريد من خلال الإدارة ثم حاول مرة أخرى.' }, { status: 409 })
      }
      throw error
    }
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تسجيل الدخول. حاول مرة أخرى لاحقاً.' }, { status: 500 })
  }
}
