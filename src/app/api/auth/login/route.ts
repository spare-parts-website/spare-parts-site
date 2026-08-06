import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const address = requestAddress(req)
    const addressLimit = rateLimit(`login:address:${address}`, 20, 10 * 60 * 1000)
    if (!addressLimit.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(addressLimit.retryAfter) } })
    }
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبة' }, { status: 400 })
    }
    const emailLimit = rateLimit(`login:email:${email}`, 8, 10 * 60 * 1000)
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

    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'BUYER' | 'ADMIN' | 'SHOP_OWNER',
      phone: user.phone,
      emailNotifications: user.emailNotifications,
    })

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      emailNotifications: user.emailNotifications,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ أثناء تسجيل الدخول' }, { status: 500 })
  }
}
