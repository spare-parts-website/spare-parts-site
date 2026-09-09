import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { decodeCursor, encodeCursor, keysetBefore, parseLimit } from '@/lib/pagination'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const url = new URL(req.url); const scope = url.searchParams.get('scope') || 'buyer'; const limit = parseLimit(url.searchParams.get('limit'), 25, 50); const cursor = decodeCursor(url.searchParams.get('cursor')); const status = url.searchParams.get('status')?.trim().toUpperCase()
    const where: Prisma.OrderWhereInput = {}
    if (scope === 'buyer') {
      if (!['BUYER','SHOP_OWNER'].includes(session.role)) return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
      where.buyerId = session.id
    } else if (scope === 'shop') {
      if (session.role !== 'SHOP_OWNER') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
      const store = await db.store.findUnique({ where: { ownerId: session.id }, select: { id: true } }); if (!store) return NextResponse.json({ orders: [], nextCursor: null, total: 0 }, { headers: PRIVATE_HEADERS }); where.storeId = store.id
    } else if (scope === 'admin') {
      if (session.role !== 'ADMIN') return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    } else return NextResponse.json({ error: 'نطاق الطلبات غير صالح' }, { status: 400, headers: PRIVATE_HEADERS })
    if (status && ['PENDING','ACCEPTED','PAID','SHIPPED','DELIVERED','REJECTED','CANCELLED','RETURNED'].includes(status)) where.status = status
    const before = keysetBefore(cursor); if (before) where.AND = [before]
    const [rows, total] = await Promise.all([
      db.order.findMany({ where, select: { id: true, quantity: true, totalPrice: true, status: true, paymentStatus: true, paymentMethod: true, shippingFee: true, governorate: true, estimatedDeliveryAt: true, trackingNumber: true, createdAt: true, part: { select: { id: true, name: true, image: true, price: true } }, items: { select: { id: true, partId: true, productName: true, productImage: true, unitPrice: true, quantity: true, discount: true, itemTotal: true }, orderBy: { createdAt: 'asc' } }, store: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }),
      db.order.count({ where: { ...where, AND: where.AND ? [] : undefined } }),
    ])
    const hasMore = rows.length > limit; const orders = rows.slice(0, limit); const nextCursor = hasMore && orders.length ? encodeCursor(orders[orders.length - 1]) : null
    return NextResponse.json({ orders, nextCursor, total }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'غير مصرح' }, { status: 401, headers: PRIVATE_HEADERS }); console.error('Order list failed', error); return NextResponse.json({ error: 'تعذر تحميل الطلبات' }, { status: 500, headers: PRIVATE_HEADERS }) }
}
