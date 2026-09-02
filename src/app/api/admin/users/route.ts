import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { deleteUserWithDependencies } from '@/lib/admin-deletion'
import { deleteUploadedFiles } from '@/lib/storage'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { audit } from '@/lib/audit'
import { recipientEmailError, validateRecipientEmail } from '@/lib/email-deliverability'

export async function GET() {
  try {
    await requireRole('ADMIN')
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatar: true,
        emailNotifications: true,
        emailDeliveryStatus: true,
        emailDeliveryReason: true,
        emailDeliveryAt: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
        _count: {
          select: { orders: true, productReviews: true, storeReviews: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ users })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'معرف المستخدم مطلوب' }, { status: 400 })
    if (body.role !== undefined && !['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(body.role)) {
      return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 })
    }
    const target = await db.user.findUnique({ where: { id }, include: { store: { select: { id: true } } } })
    if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    const role = body.role === undefined ? target.role : body.role
    if (id === session.id && role !== target.role) return NextResponse.json({ error: 'لا يمكنك تغيير دور حساب المدير الحالي' }, { status: 400 })
    if (target.role === 'SHOP_OWNER' && role !== 'SHOP_OWNER' && target.store) {
      return NextResponse.json({ error: 'احذف أو انقل المتجر قبل تغيير دور صاحبه' }, { status: 409 })
    }
    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const admins = await db.user.count({ where: { role: 'ADMIN' } })
      if (admins <= 1) return NextResponse.json({ error: 'يجب أن يبقى مدير واحد على الأقل' }, { status: 409 })
    }
    const name = body.name === undefined ? target.name : typeof body.name === 'string' ? body.name.trim() : ''
    const emailValidation = validateRecipientEmail(body.email === undefined ? target.email : body.email)
    const email = emailValidation.email
    const phone = body.phone === undefined ? target.phone : typeof body.phone === 'string' ? body.phone.trim() || null : null
    const emailNotifications = body.emailNotifications === undefined ? target.emailNotifications : body.emailNotifications
    const emailDeliveryStatus = body.emailDeliveryStatus === undefined ? target.emailDeliveryStatus : body.emailDeliveryStatus
    const avatar = body.avatar === undefined
      ? target.avatar
      : body.avatar === null || body.avatar === ''
        ? null
        : isProfileAvatar(body.avatar) || (typeof body.avatar === 'string' && body.avatar.trim().startsWith('https://'))
          ? body.avatar.trim()
          : undefined
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 })
    if (!emailValidation.valid) return NextResponse.json({ error: recipientEmailError(emailValidation), suggestion: emailValidation.suggestion }, { status: 400 })
    if (phone && phone.length > 40) return NextResponse.json({ error: 'رقم الهاتف طويل جداً' }, { status: 400 })
    if (typeof emailNotifications !== 'boolean') return NextResponse.json({ error: 'إعداد إشعارات البريد غير صالح' }, { status: 400 })
    if (!['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(emailDeliveryStatus)) return NextResponse.json({ error: 'حالة تسليم البريد غير صالحة' }, { status: 400 })
    if (avatar === undefined) return NextResponse.json({ error: 'صورة الحساب غير صالحة' }, { status: 400 })
    const emailChanged = email !== target.email
    if (emailChanged) {
      const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (existing && existing.id !== target.id) return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 409 })
    }
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id },
        data: {
          role,
          name,
          email,
          phone,
          avatar,
          emailNotifications,
          emailDeliveryStatus: emailChanged ? 'ACTIVE' : emailDeliveryStatus,
          emailDeliveryReason: emailChanged || emailDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryReason,
          emailDeliveryAt: emailChanged || emailDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryAt,
        },
        select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, emailNotifications: true, emailDeliveryStatus: true, emailDeliveryReason: true, emailDeliveryAt: true },
      })
      if (role === 'SHOP_OWNER' && !target.store) {
        await tx.store.create({ data: { name: `متجر ${next.name}`, description: '', ownerId: next.id } })
      }
      return next
    })
    if (avatar !== target.avatar) await deleteUploadedFiles([target.avatar])
    await audit({ actorId: session.id, action: 'ADMIN_USER_UPDATED', targetType: 'user', targetId: id, metadata: { roleChanged: role !== target.role, emailChanged, emailDeliveryStatus: updated.emailDeliveryStatus } })
    return NextResponse.json({ user: updated })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'المعرف مطلوب' }, { status: 400 })
    }
    if (id === session.id) {
      return NextResponse.json({ error: 'لا يمكنك حذف حساب المدير الذي تستخدمه حالياً' }, { status: 400 })
    }
    await db.$transaction((tx) => deleteUserWithDependencies(tx, id))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (e.message === 'USER_HAS_ORDERS' || e.message === 'STORE_HAS_ORDERS') {
      return NextResponse.json({ error: 'لا يمكن حذف مستخدم لديه طلبات محفوظة. احفظ سجل الطلبات أولاً.' }, { status: 409 })
    }
    console.error(e)
    return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 500 })
  }
}
