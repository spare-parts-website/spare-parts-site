import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { recipientEmailError, validateRecipientEmail } from '@/lib/email-deliverability'
import { issueLoginVerification } from '@/lib/login-verification'

function emailHint(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}

export async function POST(req: NextRequest) {
  try {
    const address = requestAddress(req)
    const ipLimit = await rateLimit(`register:ip:${address}`, 20, 15 * 60 * 1000)
    if (!ipLimit.allowed) return NextResponse.json({ error: 'محاولات تسجيل كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } })
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const emailValidation = validateRecipientEmail(body.email)
    const email = emailValidation.email
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    const phoneInput = typeof body.phone === 'string' ? body.phone.trim() : ''
    const phone = phoneInput ? normalizeEgyptianMobile(phoneInput) : null
    const avatar = isProfileAvatar(body.avatar) ? body.avatar : null

    if (!name || !email || !password) return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    if (!emailValidation.valid) return NextResponse.json({ error: recipientEmailError(emailValidation), suggestion: emailValidation.suggestion }, { status: 400 })
    if (password.length < 8 || password.length > 128) return NextResponse.json({ error: 'كلمة المرور يجب أن تكون بين 8 و128 حرفاً' }, { status: 400 })
    if (!['BUYER', 'SHOP_OWNER'].includes(role)) return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 })
    if (phoneInput && !phone) return NextResponse.json({ error: 'رقم الموبايل المصري غير صالح' }, { status: 400 })

    const accountLimit = await rateLimit(`register:account:${email}`, 5, 15 * 60 * 1000)
    if (!accountLimit.allowed) return NextResponse.json({ error: 'طلبات تسجيل كثيرة لهذا البريد. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfter) } })
    const existing = await db.user.findUnique({ where: { email }, include: { store: { select: { id: true } } } })
    if (existing?.emailVerifiedAt) return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 409 })

    const hashedPassword = await hashPassword(password)
    const targetUser = await db.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { name, password: hashedPassword, role, phone, avatar, sessionVersion: { increment: 1 } } })
        : await tx.user.create({ data: { name, email, password: hashedPassword, role, phone, avatar, emailVerifiedAt: null } })
      const store = await tx.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (role === 'SHOP_OWNER' && !store) await tx.store.create({ data: { name: `متجر ${name}`, description: '', ownerId: user.id, verificationStatus: 'UNVERIFIED', moderationStatus: 'ACTIVE' } })
      if (role === 'BUYER' && store) await tx.store.delete({ where: { id: store.id } })
      return user
    })

    try {
      const verification = await issueLoginVerification(targetUser, 'register')
      return NextResponse.json({ verificationRequired: true, ...verification, emailHint: emailHint(targetUser.email), expiresIn: 600 }, { status: existing ? 200 : 201 })
    } catch (error) {
      // Keep the unverified account/store so a provider outage cannot create a partial destructive rollback.
      const message = error instanceof Error ? error.message : ''
      console.error('Registration verification failed:', message)
      return NextResponse.json({ error: 'تم حفظ بيانات التسجيل ولكن تعذر إرسال رمز التحقق الآن. أعد المحاولة من تسجيل الدخول أو التسجيل بعد قليل.' }, { status: 503 })
    }
  } catch (error) {
    console.error('Registration failed', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء التسجيل' }, { status: 500 })
  }
}
