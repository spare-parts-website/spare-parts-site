import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isBlockedStoreName } from '@/lib/store-moderation'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const id = searchParams.get('id')

  if (id) {
    const store = await db.store.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, phone: true, avatar: true } },
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
    if (!store || isBlockedStoreName(store.name)) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    }
    const completedOrderCount = await db.order.count({ where: { storeId: store.id, status: 'DELIVERED' } })
    const session = await getSession()
    const canReview = session && ['BUYER', 'SHOP_OWNER'].includes(session.role)
      ? Boolean(await db.order.findFirst({
          where: { buyerId: session.id, storeId: store.id, status: { in: ['DELIVERED', 'RETURNED'] } },
          select: { id: true },
        }))
      : false
    return NextResponse.json({ store: { ...store, completedOrderCount }, canReview })
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
      owner: { select: { name: true, avatar: true } },
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
  const visibleStores = stores.filter((store) => !isBlockedStoreName(store.name))

  const storesWithRating = await Promise.all(
    visibleStores.map(async (s) => {
      const [reviews, completedOrderCount] = await Promise.all([
        db.storeReview.findMany({
        where: { storeId: s.id, blocked: false },
        select: { rating: true },
        }),
        db.order.count({ where: { storeId: s.id, status: 'DELIVERED' } }),
      ])
      const avgRating = reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0
      return { ...s, avgRating, reviewCount: reviews.length, completedOrderCount }
    })
  )

    return NextResponse.json({ stores: storesWithRating })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل المتاجر' }, { status: 500 })
  }
}
