import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { recipientEmailError, validateRecipientEmail } from '@/lib/email-deliverability'

import { issueLoginVerification } from '@/lib/login-verification'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`register-v2:${requestAddress(req)}`, 100, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'محاولات تسجيل كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const emailValidation = validateRecipientEmail(body.email)
    const email = emailValidation.email
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

    if (!emailValidation.valid) {
      return NextResponse.json({ error: recipientEmailError(emailValidation), suggestion: emailValidation.suggestion }, { status: 400 })
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

    const existing = await db.user.findUnique({
      where: { email },
      include: {
        loginVerifications: { where: { verifiedAt: { not: null } } },
        orders: { select: { id: true }, take: 1 },
      },
    })
    if (existing) {
      const isVerified = existing.orders.length > 0 || existing.loginVerifications.length > 0
      if (isVerified) {
        return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 400 })
      }
    }

    const hashedPassword = await hashPassword(password)
    let targetUser: {
      id: string
      name: string
      email: string
      role: string
      phone: string | null
      avatar: string | null
      emailDeliveryStatus?: string | null
    }

    if (existing) {
      targetUser = await db.user.update({
        where: { id: existing.id },
        data: {
          name,
          password: hashedPassword,
          role,
          phone,
          avatar,
        },
      })
      if (role === 'SHOP_OWNER') {
        const store = await db.store.findUnique({ where: { ownerId: existing.id } })
        if (!store) {
          await db.store.create({
            data: {
              name: `متجر ${name}`,
              description: '',
              ownerId: existing.id,
            },
          })
        }
      }
    } else {
      targetUser = await db.$transaction(async (tx) => {
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
    }

    try {
      const verification = await issueLoginVerification(targetUser, 'register')
      return NextResponse.json({
        verificationRequired: true,
        ...verification,
      }, { status: 201 })
    } catch (error) {
      if (!existing) {
        await db.user.delete({ where: { id: targetUser.id } }).catch(() => undefined)
      }
      if (error instanceof Error && error.message === 'EMAIL_UNDELIVERABLE') {
        return NextResponse.json({ error: 'تعذر إرسال رمز التحقق إلى هذا البريد. تأكد من صحة البريد.' }, { status: 400 })
      }
      console.error('Registration verification failed:', error)
      return NextResponse.json({ error: 'تعذر إرسال رمز التحقق إلى بريدك الإلكتروني. حاول مرة أخرى لاحقاً.' }, { status: 500 })
    }
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ أثناء التسجيل' }, { status: 500 })
  }
}
