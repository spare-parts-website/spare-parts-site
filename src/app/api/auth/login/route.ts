import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, verifyPassword } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

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

    // Clean any existing login verifications for this user
    await db.loginVerification.deleteMany({ where: { userId: user.id } })

    // Create session immediately for all roles (OTP removed from login flow)
    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'BUYER' | 'ADMIN' | 'SHOP_OWNER',
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
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تسجيل الدخول. حاول مرة أخرى لاحقاً.' }, { status: 500 })
  }
}
