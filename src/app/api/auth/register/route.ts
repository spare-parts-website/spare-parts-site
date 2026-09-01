import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`register:${requestAddress(req)}`, 5, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'محاولات تسجيل كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    const phoneInput = typeof body.phone === 'string' ? body.phone.trim() : ''
    const phone = phoneInput ? normalizeEgyptianMobile(phoneInput) : null
    const avatar = isProfileAvatar(body.avatar) ? body.avatar : null

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
    }

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    }

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 })
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
    }

    if (!['BUYER', 'SHOP_OWNER'].includes(role)) {
      return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 })
    }
    if (phoneInput && !phone) {
      return NextResponse.json({ error: 'رقم الموبايل المصري غير صالح' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
          phone,
          avatar,
        },
      })

      // If shop owner, create the store atomically with the account.
      if (role === 'SHOP_OWNER') {
        await tx.store.create({
          data: {
            name: `متجر ${name}`,
            description: '',
            ownerId: createdUser.id,
          },
        })
      }

      return createdUser
    })

    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'BUYER' | 'ADMIN' | 'SHOP_OWNER',
      phone: user.phone,
      avatar: user.avatar,
      sessionVersion: user.sessionVersion,
    })

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ أثناء التسجيل' }, { status: 500 })
  }
}
