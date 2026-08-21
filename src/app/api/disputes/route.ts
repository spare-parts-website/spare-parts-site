import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { audit } from '@/lib/audit'

const EVIDENCE_URL = /^\/api\/private-image\?path=[A-Za-z0-9%._-]+$/

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const admin = session.role === 'ADMIN' && new URL(req.url).searchParams.get('scope') === 'admin'
    const disputes = await db.dispute.findMany({ where: admin ? {} : { buyerId: session.id }, include: { order: { include: { part: { select: { name: true } }, store: { select: { name: true } } } }, buyer: { select: { name: true, email: true } }, reviewedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ disputes })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' ? 'غير مصرح' : 'تعذر تحميل النزاعات' }, { status: e.message === 'UNAUTHORIZED' ? 401 : 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(); const { orderId, type, reason, evidenceUrls } = await req.json()
    const order = await db.order.findFirst({ where: { id: orderId, buyerId: session.id }, select: { id: true, storeId: true, store: { select: { ownerId: true } } } })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    if (!['RETURN', 'WRONG_ITEM', 'DAMAGED', 'DELIVERY', 'OTHER'].includes(type) || typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 2000) return NextResponse.json({ error: 'اكتب سببًا واضحًا للنزاع' }, { status: 400 })
    const urls = Array.isArray(evidenceUrls) ? evidenceUrls.filter((url) => typeof url === 'string' && EVIDENCE_URL.test(url)).slice(0, 3) : []
    const dispute = await db.dispute.create({ data: { orderId, buyerId: session.id, storeId: order.storeId, type, reason: reason.trim(), evidenceUrls: urls.length ? JSON.stringify(urls) : null } })
    await Promise.allSettled([createNotification({ userId: order.store.ownerId, title: 'نزاع جديد على طلب', message: 'فتح العميل طلب حماية جديد. راجع تفاصيل الطلب.', type: 'DISPUTE', link: 'shop-dashboard' }), audit({ actorId: session.id, action: 'DISPUTE_OPENED', targetType: 'order', targetId: orderId })])
    return NextResponse.json({ dispute }, { status: 201 })
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'يوجد نزاع مفتوح لهذا الطلب بالفعل' }, { status: 409 })
    return NextResponse.json({ error: e.message === 'UNAUTHORIZED' ? 'غير مصرح' : 'تعذر فتح النزاع' }, { status: e.message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN'); const { id, status, resolution } = await req.json()
    if (!['RESOLVED_BUYER', 'RESOLVED_SELLER', 'REJECTED'].includes(status) || typeof resolution !== 'string' || resolution.trim().length < 3) return NextResponse.json({ error: 'قرار الإدارة غير صالح' }, { status: 400 })
    const dispute = await db.$transaction(async (tx) => {
      const current = await tx.dispute.findUnique({ where: { id }, include: { order: true } })
      if (!current) throw new Error('NOT_FOUND')
      if (current.status !== 'OPEN') return current
      const updated = await tx.dispute.update({ where: { id }, data: { status, resolution: resolution.trim().slice(0, 2000), reviewedById: admin.id } })
      if (status === 'RESOLVED_BUYER' && current.order.status !== 'RETURNED') {
        await tx.order.update({ where: { id: current.orderId }, data: { status: 'RETURNED', paymentStatus: current.order.paymentStatus === 'PAID' ? 'REFUNDED' : current.order.paymentStatus, timeline: { create: { status: 'RETURNED', note: 'تم قبول طلب الحماية والاسترجاع بقرار الإدارة' } } } })
        await tx.part.update({ where: { id: current.order.partId }, data: { stock: { increment: current.order.quantity } } })
      }
      return updated
    })
    await Promise.allSettled([createNotification({ userId: dispute.buyerId, title: 'صدر قرار في النزاع', message: resolution.trim(), type: 'DISPUTE', link: 'orders' }), audit({ actorId: admin.id, action: 'DISPUTE_RESOLVED', targetType: 'dispute', targetId: id, metadata: { status } })])
    return NextResponse.json({ dispute })
  } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر حفظ القرار' }, { status: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 403 : 500 }) }
}
