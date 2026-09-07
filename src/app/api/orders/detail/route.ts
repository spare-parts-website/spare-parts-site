import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const id = new URL(req.url).searchParams.get('id')?.trim(); if (!id) return NextResponse.json({ error: 'معرف الطلب مطلوب' }, { status: 400, headers: PRIVATE_HEADERS })
    const order = await db.order.findUnique({ where: { id }, include: { part: { select: { id: true, name: true, image: true, price: true } }, items: { orderBy: { createdAt: 'asc' } }, store: { select: { id: true, name: true, ownerId: true } }, buyer: { select: { id: true, name: true, phone: true, email: true } }, timeline: { orderBy: { createdAt: 'asc' } } } })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404, headers: PRIVATE_HEADERS })
    const allowed = session.role === 'ADMIN' || order.buyerId === session.id || order.store.ownerId === session.id
    if (!allowed) return NextResponse.json({ error: 'غير مصرح' }, { status: 403, headers: PRIVATE_HEADERS })
    return NextResponse.json({ order }, { headers: PRIVATE_HEADERS })
  } catch (error) { const message = error instanceof Error ? error.message : ''; return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'غير مصرح' : 'تعذر تحميل الطلب' }, { status: message === 'UNAUTHORIZED' ? 401 : 500, headers: PRIVATE_HEADERS }) }
}
