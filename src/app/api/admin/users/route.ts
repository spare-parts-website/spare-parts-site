import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminStepUp, requireRole } from '@/lib/auth'
import { deleteUserWithDependencies } from '@/lib/admin-deletion'
import { deleteUploadedFiles } from '@/lib/storage'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { isPublicUploadUrl } from '@/lib/storage-url'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { audit } from '@/lib/audit'
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from '@/lib/pagination'
import { recipientEmailError, validateRecipientEmail } from '@/lib/email-deliverability'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN'); const url = new URL(req.url); const id = url.searchParams.get('id')?.trim()
    if (id) {
      const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, emailNotifications: true, emailDeliveryStatus: true, emailDeliveryReason: true, emailDeliveryAt: true, emailVerifiedAt: true, createdAt: true, store: { select: { id: true, name: true } }, _count: { select: { orders: true, productReviews: true, storeReviews: true } } } })
      return user ? NextResponse.json({ user }, { headers: PRIVATE_HEADERS }) : NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404, headers: PRIVATE_HEADERS })
    }
    const limit = parseLimit(url.searchParams.get('limit'), 25, 100); const cursor = decodeCursor(url.searchParams.get('cursor')); const search = (url.searchParams.get('search') || '').trim().slice(0, 100); const role = url.searchParams.get('role')?.trim().toUpperCase()
    const base: Prisma.UserWhereInput = {}; if (role && ['BUYER','SHOP_OWNER','ADMIN'].includes(role)) base.role = role; if (search) base.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }]
    const where: Prisma.UserWhereInput = { ...base }; const before = keysetBefore(cursor); if (before) where.AND = [before]
    const [rows,total] = await Promise.all([db.user.findMany({ where, select: { id: true, name: true, role: true, avatar: true, createdAt: true, store: { select: { id: true, name: true } }, _count: { select: { orders: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }), db.user.count({ where: base })])
    const hasMore = rows.length > limit; const users = rows.slice(0, limit); return NextResponse.json({ users, total, nextCursor: hasMore && users.length ? encodeCursor(users[users.length - 1]) : null }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500, headers: PRIVATE_HEADERS }) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json(); const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'معرف المستخدم مطلوب' }, { status: 400 }); if (body.role !== undefined && !['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(body.role)) return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id }, include: { store: { select: { id: true } } } }); if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    if (body.email !== undefined) {
      const emailValidation = validateRecipientEmail(body.email)
      if (!emailValidation.valid) return NextResponse.json({ error: recipientEmailError(emailValidation), suggestion: emailValidation.suggestion }, { status: 400 })
      if (emailValidation.email !== target.email) return NextResponse.json({ error: 'تغيير البريد الإلكتروني يتطلب تحقق صاحب الحساب من صفحة ملفه الشخصي.' }, { status: 409 })
    }
    const role = body.role === undefined ? target.role : body.role; if (id === session.id && role !== target.role) return NextResponse.json({ error: 'لا يمكنك تغيير دور حساب المدير الحالي' }, { status: 400 })
    if (target.role === 'SHOP_OWNER' && role !== 'SHOP_OWNER' && target.store) return NextResponse.json({ error: 'احذف أو انقل المتجر قبل تغيير دور صاحبه' }, { status: 409 })
    if (target.role === 'ADMIN' && role !== 'ADMIN') { const admins = await db.user.count({ where: { role: 'ADMIN' } }); if (admins <= 1) return NextResponse.json({ error: 'يجب أن يبقى مدير واحد على الأقل' }, { status: 409 }) }
    const name = body.name === undefined ? target.name : typeof body.name === 'string' ? body.name.trim() : ''; const phoneInput = body.phone === undefined ? target.phone : typeof body.phone === 'string' ? body.phone.trim() : body.phone === null ? '' : null; const phone = phoneInput ? normalizeEgyptianMobile(phoneInput) : null; const emailNotifications = body.emailNotifications === undefined ? target.emailNotifications : body.emailNotifications; const emailDeliveryStatus = body.emailDeliveryStatus === undefined ? target.emailDeliveryStatus : body.emailDeliveryStatus; const avatar = body.avatar === undefined ? target.avatar : body.avatar === null || body.avatar === '' ? null : isProfileAvatar(body.avatar) || isPublicUploadUrl(body.avatar) ? body.avatar : undefined
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'الاسم يجب أن يكون بين حرفين و100 حرف' }, { status: 400 }); if (phoneInput === null || (phoneInput && !phone)) return NextResponse.json({ error: 'رقم الموبايل المصري غير صالح' }, { status: 400 }); if (typeof emailNotifications !== 'boolean') return NextResponse.json({ error: 'إعداد إشعارات البريد غير صالح' }, { status: 400 }); if (!['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(emailDeliveryStatus)) return NextResponse.json({ error: 'حالة تسليم البريد غير صالحة' }, { status: 400 }); if (avatar === undefined) return NextResponse.json({ error: 'صورة الحساب غير صالحة' }, { status: 400 })
    const roleChanged = role !== target.role
    const updated = await db.$transaction(async (tx) => { const next = await tx.user.update({ where: { id }, data: { role, name, phone, avatar, emailNotifications, emailDeliveryStatus, emailDeliveryReason: emailDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryReason, emailDeliveryAt: emailDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryAt, ...(roleChanged ? { sessionVersion: { increment: 1 } } : {}), ...(roleChanged && (target.role === 'ADMIN' || role === 'ADMIN') ? { adminMfaSecret: null, adminMfaEnabledAt: null, adminMfaRecoveryCodes: null, adminMfaLastCounter: null } : {}) }, select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, emailNotifications: true, emailDeliveryStatus: true, emailDeliveryReason: true, emailDeliveryAt: true } }); if (role === 'SHOP_OWNER' && !target.store) await tx.store.create({ data: { name: `متجر ${next.name}`, description: '', ownerId: next.id, moderationStatus: 'ACTIVE', verificationStatus: 'UNVERIFIED' } }); return next })
    if (avatar !== target.avatar) await deleteUploadedFiles([target.avatar]); await audit({ actorId: session.id, action: 'ADMIN_USER_UPDATED', targetType: 'user', targetId: id, metadata: { roleChanged, fromRole: target.role, toRole: role, emailDeliveryStatus: updated.emailDeliveryStatus } }); return NextResponse.json({ user: updated })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل تعديل حسابات المستخدمين.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  try { const session = await requireAdminStepUp(); const id = new URL(req.url).searchParams.get('id'); if (!id) return NextResponse.json({ error: 'المعرف مطلوب' }, { status: 400 }); if (id === session.id) return NextResponse.json({ error: 'لا يمكنك حذف حساب المدير الذي تستخدمه حالياً' }, { status: 400 }); const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } }); if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 }); await db.$transaction((tx) => deleteUserWithDependencies(tx, id)); await audit({ actorId: session.id, action: 'ADMIN_USER_DELETED', targetType: 'user', targetId: id, metadata: { deletedRole: target.role } }); return NextResponse.json({ ok: true }) }
  catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل حذف مستخدم.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); if (message === 'USER_HAS_ORDERS' || message === 'STORE_HAS_ORDERS') return NextResponse.json({ error: 'لا يمكن حذف مستخدم لديه طلبات محفوظة. احفظ سجل الطلبات أولاً.' }, { status: 409 }); console.error(error); return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 500 }) }
}
