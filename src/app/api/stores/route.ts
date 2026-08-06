import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const id = searchParams.get('id')

  if (id) {
    const store = await db.store.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, phone: true } },
        parts: {
          where: { blocked: false },
          orderBy: { createdAt: 'desc' },
        },
        reviews: {
          where: { blocked: false },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!store) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    }
    return NextResponse.json({ store })
  }

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      }
    : {}

  const stores = await db.store.findMany({
    where,
    include: {
      _count: { select: { parts: { where: { blocked: false } } } },
      parts: {
        where: { blocked: false },
        take: 3,
        select: { id: true, name: true, price: true, image: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Compute average rating
  const storesWithRating = await Promise.all(
    stores.map(async (s) => {
      const reviews = await db.storeReview.findMany({
        where: { storeId: s.id, blocked: false },
        select: { rating: true },
      })
      const avgRating = reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0
      return { ...s, avgRating, reviewCount: reviews.length }
    })
  )

    return NextResponse.json({ stores: storesWithRating })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل المتاجر' }, { status: 500 })
  }
}
