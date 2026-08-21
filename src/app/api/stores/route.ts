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
          select: { id: true, name: true, price: true, stock: true, category: true, brand: true, image: true },
        },
        reviews: {
          where: { blocked: false },
          include: { user: { select: { name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!store || isBlockedStoreName(store.name)) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
    }
    const [completedOrderCount, decidedOrderCount] = await Promise.all([
      db.order.count({ where: { storeId: store.id, status: 'DELIVERED' } }),
      db.order.count({ where: { storeId: store.id, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } } }),
    ])
    const session = await getSession()
    const canReview = session && ['BUYER', 'SHOP_OWNER'].includes(session.role)
      ? Boolean(await db.order.findFirst({
          where: { buyerId: session.id, storeId: store.id, status: { in: ['DELIVERED', 'RETURNED'] } },
          select: { id: true },
        }))
      : false
    return NextResponse.json({ store: { ...store, completedOrderCount, completionRate: decidedOrderCount ? Math.round(completedOrderCount / decidedOrderCount * 100) : 100 }, canReview })
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
        _count: {
          select: {
            parts: { where: { blocked: false } },
            orders: { where: { status: 'DELIVERED' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

  // Compute average rating
  const visibleStores = stores.filter((store) => !isBlockedStoreName(store.name))

  const reviewGroups = visibleStores.length
    ? await db.storeReview.groupBy({
        by: ['storeId'],
        where: { storeId: { in: visibleStores.map((store) => store.id) }, blocked: false },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : []
  const reviewByStore = new Map(reviewGroups.map((review) => [review.storeId, review]))
  const decidedGroups = visibleStores.length ? await db.order.groupBy({ by: ['storeId'], where: { storeId: { in: visibleStores.map((store) => store.id) }, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } }, _count: { _all: true } }) : []
  const decidedByStore = new Map(decidedGroups.map((item) => [item.storeId, item._count._all]))
  const storesWithRating = visibleStores.map((store) => {
    const review = reviewByStore.get(store.id)
    return {
      ...store,
      avgRating: review?._avg.rating || 0,
      reviewCount: review?._count._all || 0,
      completedOrderCount: store._count.orders,
      completionRate: decidedByStore.get(store.id) ? Math.round(store._count.orders / decidedByStore.get(store.id)! * 100) : 100,
    }
  })

    return NextResponse.json(
      { stores: storesWithRating },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل المتاجر' }, { status: 500 })
  }
}
