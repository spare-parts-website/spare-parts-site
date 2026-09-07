import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminStepUp, requireAuth } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['BUYER', 'SHOP_OWNER'].includes(session.role)) return NextResponse.json({ error: 'التقييم متاح للمشترين وأصحاب المحلات فقط' }, { status: 403 })
    const limit = await rateLimit(`reviews:${session.id}:${requestAddress(req)}`, 20, 60 * 60 * 1000); if (!limit.allowed) return NextResponse.json({ error: 'تقييمات كثيرة. حاول مرة أخرى لاحقاً.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    const body = await req.json(); const { type, targetId, rating, comment, sellerRating, packagingRating, deliveryRating, orderId } = body
    if (type !== 'product' && type !== 'store') return NextResponse.json({ error: 'نوع تقييم غير صالح' }, { status: 400 })
    if (!targetId || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return NextResponse.json({ error: 'بيانات التقييم غير صحيحة' }, { status: 400 })
    const dimensions = [sellerRating, packagingRating, deliveryRating].map(Number)
    if (type === 'product' && dimensions.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return NextResponse.json({ error: 'كل بنود التقييم مطلوبة من نجمة إلى 5 نجوم' }, { status: 400 })
    if (comment !== undefined && comment !== null && (typeof comment !== 'string' || comment.trim().length > 1000)) return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })
    let verifiedOrderId: string | null = null
    if (type === 'product') { const order = await db.order.findFirst({ where: { buyerId: session.id, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId: targetId }, { items: { some: { partId: targetId } } }], ...(typeof orderId === 'string' ? { id: orderId } : {}) } }); if (!order) return NextResponse.json({ error: 'لا يمكن التقييم بدون طلب مكتمل' }, { status: 400 }); verifiedOrderId = order.id }
    else { const order = await db.order.findFirst({ where: { buyerId: session.id, storeId: targetId, status: { in: ['DELIVERED', 'RETURNED'] } } }); if (!order) return NextResponse.json({ error: 'لا يمكن التقييم بدون طلب مكتمل' }, { status: 400 }) }
    const cleanComment = typeof comment === 'string' ? comment.trim() || null : null
    if (type === 'product') {
      const data = { rating: Number(rating), sellerRating: dimensions[0], packagingRating: dimensions[1], deliveryRating: dimensions[2], orderId: verifiedOrderId, comment: cleanComment }
      let created = false; let review
      const existing = await db.productReview.findUnique({ where: { userId_partId: { userId: session.id, partId: targetId } } })
      if (existing) review = await db.productReview.update({ where: { id: existing.id }, data })
      else { try { review = await db.productReview.create({ data: { userId: session.id, partId: targetId, ...data } }); created = true } catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error; review = await db.productReview.update({ where: { userId_partId: { userId: session.id, partId: targetId } }, data }) } }
      if (created) { const part = await db.part.findUnique({ where: { id: targetId }, select: { name: true, store: { select: { ownerId: true } } } }); if (part) await createNotification({ userId: part.store.ownerId, title: 'تقييم جديد', message: `أضاف عميل تقييماً موثقاً لقطعة "${part.name}".`, type: 'REVIEW', link: 'shop-dashboard', dedupeKey: `review/${review.id}/${part.store.ownerId}` }) }
      return NextResponse.json({ review })
    }
    const data = { rating: Number(rating), comment: cleanComment }
    const existing = await db.storeReview.findUnique({ where: { userId_storeId: { userId: session.id, storeId: targetId } } })
    let review
    if (existing) review = await db.storeReview.update({ where: { id: existing.id }, data })
    else { try { review = await db.storeReview.create({ data: { userId: session.id, storeId: targetId, ...data } }) } catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error; review = await db.storeReview.update({ where: { userId_storeId: { userId: session.id, storeId: targetId } }, data }) } }
    return NextResponse.json({ review })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const body = await req.json(); const { id, type, blocked } = body
    if (!id || (type !== 'product' && type !== 'store')) return NextResponse.json({ error: 'معرف ونوع التقييم غير صالحين' }, { status: 400 })
    const review = type === 'product' ? await db.productReview.update({ where: { id }, data: { blocked: Boolean(blocked) } }) : await db.storeReview.update({ where: { id }, data: { blocked: Boolean(blocked) } })
    await audit({ actorId: session.id, action: blocked ? 'ADMIN_REVIEW_BLOCKED' : 'ADMIN_REVIEW_UNBLOCKED', targetType: `${type}_review`, targetId: id })
    return NextResponse.json({ review })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل تعديل تقييم.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdminStepUp(); const params = new URL(req.url).searchParams; const id = params.get('id'); const type = params.get('type')
    if (!id || (type !== 'product' && type !== 'store')) return NextResponse.json({ error: 'معرف ونوع التقييم مطلوبان' }, { status: 400 })
    if (type === 'product') await db.productReview.delete({ where: { id } }); else await db.storeReview.delete({ where: { id } })
    await audit({ actorId: session.id, action: 'ADMIN_REVIEW_DELETED', targetType: `${type}_review`, targetId: id })
    return NextResponse.json({ ok: true })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'STEP_UP_REQUIRED') return NextResponse.json({ error: 'يلزم تأكيد هوية المدير قبل حذف تقييم.', stepUpUrl: '/admin/security' }, { status: 428 }); if (message === 'UNAUTHORIZED' || message === 'FORBIDDEN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 }); console.error(error); return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 }) }
}
