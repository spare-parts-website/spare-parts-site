import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, requireAuth } from '@/lib/auth'
import { EMAIL_CHANGE_MAX_ATTEMPTS, matchesEmailChangeCode, sendEmailChangedNotice } from '@/lib/email-change'
import { audit } from '@/lib/audit'
import { rateLimit, requestAddress } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const limit = await rateLimit(`email-change-verify:${session.id}:${requestAddress(req)}`, 15, 15 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'محاولات كثيرة. حاول لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json()
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!challengeId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'أدخل رمز التحقق المكون من 6 أرقام' }, { status: 400 })
    const request = await db.emailChangeRequest.findFirst({ where: { id: challengeId, userId: session.id } })
    if (!request || request.expiresAt <= new Date()) return NextResponse.json({ error: 'انتهت صلاحية رمز البريد الجديد. احفظ التغيير مرة أخرى للحصول على رمز جديد.' }, { status: 410 })
    if (request.attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) return NextResponse.json({ error: 'تم تجاوز عدد المحاولات. اطلب تغيير البريد من جديد.' }, { status: 429 })
    const claimed = await db.emailChangeRequest.updateMany({ where: { id: request.id, userId: session.id, expiresAt: { gt: new Date() }, attempts: { lt: EMAIL_CHANGE_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } })
    if (claimed.count !== 1) return NextResponse.json({ error: 'طلب تغيير البريد لم يعد صالحاً' }, { status: 409 })
    if (!matchesEmailChangeCode(request.id, code, request.codeHash)) return NextResponse.json({ error: 'رمز التحقق غير صحيح' }, { status: 400 })

    const oldEmail = session.email
    const now = new Date()
    const updated = await db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`email-change:${session.id}`}))`
      const pending = await tx.emailChangeRequest.findFirst({ where: { id: request.id, userId: session.id, expiresAt: { gt: now } } })
      if (!pending) throw new Error('EMAIL_CHANGE_USED')
      const conflict = await tx.user.findUnique({ where: { email: pending.targetEmail }, select: { id: true } })
      if (conflict && conflict.id !== session.id) throw new Error('EMAIL_TAKEN')
      const user = await tx.user.update({ where: { id: session.id }, data: { email: pending.targetEmail, emailVerifiedAt: now, emailDeliveryStatus: 'ACTIVE', emailDeliveryReason: null, emailDeliveryAt: null, sessionVersion: { increment: 1 } } })
      await tx.emailChangeRequest.delete({ where: { id: pending.id } })
      return user
    })
    await createSession({ id: updated.id, name: updated.name, email: updated.email, role: updated.role as 'BUYER' | 'ADMIN' | 'SHOP_OWNER', phone: updated.phone, avatar: updated.avatar, emailNotifications: updated.emailNotifications, emailDeliveryStatus: updated.emailDeliveryStatus, emailDeliveryReason: updated.emailDeliveryReason, emailDeliveryAt: updated.emailDeliveryAt, sessionVersion: updated.sessionVersion, mfaVerifiedAt: session.mfaVerifiedAt })
    await audit({ actorId: session.id, action: 'ACCOUNT_EMAIL_UPDATED', targetType: 'user', targetId: session.id, metadata: { oldDomain: oldEmail.split('@')[1] || '', newDomain: updated.email.split('@')[1] || '' } })
    void sendEmailChangedNotice({ userId: session.id, name: updated.name, oldEmail, newEmail: updated.email })
    return NextResponse.json({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated.phone, avatar: updated.avatar, emailNotifications: updated.emailNotifications, emailDeliveryStatus: updated.emailDeliveryStatus, emailDeliveryReason: updated.emailDeliveryReason, emailDeliveryAt: updated.emailDeliveryAt } })
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_TAKEN') return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل' }, { status: 409 })
    if (error instanceof Error && error.message === 'EMAIL_CHANGE_USED') return NextResponse.json({ error: 'تم استخدام طلب تغيير البريد أو انتهت صلاحيته' }, { status: 409 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    console.error('Email change verification failed', error)
    return NextResponse.json({ error: 'تعذر تأكيد البريد الجديد' }, { status: 500 })
  }
}
