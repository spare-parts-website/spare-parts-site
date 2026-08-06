import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const { type, targetId, rating, comment } = body

    // type: 'product' | 'store'
    if (!['product', 'store'].includes(type)) {
      return NextResponse.json({ error: 'نوع تقييم غير صالح' }, { status: 400 })
    }
    if (!targetId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'بيانات التقييم غير صحيحة' }, { status: 400 })
    }

    // Check the user has a delivered/completed order on this product or store
    if (type === 'product') {
      const order = await db.order.findFirst({
        where: {
          buyerId: session.id,
          partId: targetId,
          status: { in: ['DELIVERED', 'RETURNED'] },
        },
      })
      if (!order) {
        return NextResponse.json({ error: 'لا يمكن التقييم بدون طلب مكتمل' }, { status: 400 })
      }
    } else {
      const order = await db.order.findFirst({
        where: {
          buyerId: session.id,
          storeId: targetId,
          status: { in: ['DELIVERED', 'RETURNED'] },
        },
      })
      if (!order) {
        return NextResponse.json({ error: 'لا يمكن التقييم بدون طلب مكتمل' }, { status: 400 })
      }
    }

    // Upsert review (one per user per target)
    if (type === 'product') {
      const existing = await db.productReview.findFirst({
        where: { userId: session.id, partId: targetId },
      })
      let review
      if (existing) {
        review = await db.productReview.update({
          where: { id: existing.id },
          data: { rating, comment: comment || null },
        })
      } else {
        review = await db.productReview.create({
          data: { userId: session.id, partId: targetId, rating, comment: comment || null },
        })
      }
      return NextResponse.json({ review })
    } else {
      const existing = await db.storeReview.findFirst({
        where: { userId: session.id, storeId: targetId },
      })
      let review
      if (existing) {
        review = await db.storeReview.update({
          where: { id: existing.id },
          data: { rating, comment: comment || null },
        })
      } else {
        review = await db.storeReview.create({
          data: { userId: session.id, storeId: targetId, rating, comment: comment || null },
        })
      }
      return NextResponse.json({ review })
    }
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// Block / unblock review (admin only)
export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json()
    const { id, type, blocked } = body

    if (type === 'product') {
      const review = await db.productReview.update({
        where: { id },
        data: { blocked: !!blocked },
      })
      return NextResponse.json({ review })
    } else {
      const review = await db.storeReview.update({
        where: { id },
        data: { blocked: !!blocked },
      })
      return NextResponse.json({ review })
    }
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
    await requireRole('ADMIN')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type')
    if (!id || !type) {
      return NextResponse.json({ error: 'معرف ونوع التقييم مطلوبان' }, { status: 400 })
    }
    if (type === 'product') {
      await db.productReview.delete({ where: { id } })
    } else {
      await db.storeReview.delete({ where: { id } })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    console.error(e)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

async function requireRole(role: string) {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHORIZED')
  if (session.role !== role) throw new Error('FORBIDDEN')
  return session
}
