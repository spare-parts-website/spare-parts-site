import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, hashPassword, verifyPassword, createSession } from '@/lib/auth'
import { deleteUploadedFiles } from '@/lib/storage'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { audit } from '@/lib/audit'
import { recipientEmailError, validateRecipientEmail } from '@/lib/email-deliverability'

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : session.name
    const emailValidation = validateRecipientEmail(typeof body.email === 'string' ? body.email : session.email)
    const email = emailValidation.email
    const phoneInput = typeof body.phone === 'string' ? body.phone.trim() : session.phone || ''
    const phone = phoneInput ? normalizeEgyptianMobile(phoneInput) : null
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const emailNotifications = typeof body.emailNotifications === 'boolean' ? body.emailNotifications : session.emailNotifications ?? true
    const avatar = body.avatar === null
      ? null
      : isProfileAvatar(body.avatar)
        ? body.avatar
        : typeof body.avatar === 'string' && body.avatar.trim().startsWith('https://')
          ? body.avatar.trim()
          : session.avatar || null

    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    if (!emailValidation.valid) return NextResponse.json({ error: recipientEmailError(emailValidation), suggestion: emailValidation.suggestion }, { status: 400 })
    if (phoneInput && !phone) return NextResponse.json({ error: 'رقم الموبايل المصري غير صالح' }, { status: 400 })
    if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) return NextResponse.json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    const emailChanged = email !== user.email
    if (emailChanged) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.password))) return NextResponse.json({ error: 'أدخل كلمة المرور الحالية لتغيير البريد الإلكتروني' }, { status: 400 })
      const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (existing && existing.id !== user.id) return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 409 })
    }
    if (newPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.password))) return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: session.id },
      data: {
        name,
        email,
        phone,
        avatar,
        emailNotifications,
        ...(emailChanged ? { emailDeliveryStatus: 'ACTIVE', emailDeliveryReason: null, emailDeliveryAt: null } : {}),
        ...(newPassword ? { password: await hashPassword(newPassword), sessionVersion: { increment: 1 } } : {}),
      },
    })
    if (avatar !== user.avatar) await deleteUploadedFiles([user.avatar])
    await createSession({ id: updated.id, name: updated.name, email: updated.email, role: updated.role as any, phone: updated.phone, avatar: updated.avatar, emailNotifications: updated.emailNotifications, emailDeliveryStatus: updated.emailDeliveryStatus, emailDeliveryReason: updated.emailDeliveryReason, emailDeliveryAt: updated.emailDeliveryAt, sessionVersion: updated.sessionVersion })
    if (emailChanged) await audit({ actorId: session.id, action: 'ACCOUNT_EMAIL_UPDATED', targetType: 'user', targetId: session.id, metadata: { emailChanged: true } })
    return NextResponse.json({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated.phone, avatar: updated.avatar, emailNotifications: updated.emailNotifications, emailDeliveryStatus: updated.emailDeliveryStatus, emailDeliveryReason: updated.emailDeliveryReason, emailDeliveryAt: updated.emailDeliveryAt } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'تعذر تحديث الحساب' }, { status: 500 })
  }
}
