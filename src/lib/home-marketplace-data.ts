import 'server-only'

import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'
import { isDevelopmentReviewAuthor } from '@/lib/review-moderation'

export type HomeMarketplacePart = {
  id: string
  name: string
  price: number
  stock: number
  brand: string | null
  condition: string | null
  image: string | null
  store: { id: string; name: string; image: string | null; verified: boolean }
}

export type HomeMarketplaceStore = {
  id: string
  name: string
  description: string | null
  image: string | null
  verified: boolean
  _count: { parts: number }
  avgRating: number
  reviewCount: number
}

export type HomeMarketplacePayload = {
  parts: HomeMarketplacePart[]
  stores: HomeMarketplaceStore[]
}

const loadHomeMarketplaceCached = unstable_cache(async (): Promise<HomeMarketplacePayload> => {
  const [recentParts, recentStores] = await Promise.all([
    db.part.findMany({
      where: { blocked: false },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        brand: true,
        condition: true,
        image: true,
        store: { select: { id: true, name: true, image: true, verified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 16,
    }),
    db.store.findMany({
      where: { parts: { some: { blocked: false } } },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        verified: true,
        _count: { select: { parts: { where: { blocked: false } } } },
      },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      take: 12,
    }),
  ])

  const parts = recentParts.filter((part) => !isBlockedStoreName(part.store.name)).slice(0, 8)
  const visibleStores = recentStores.filter((store) => !isBlockedStoreName(store.name)).slice(0, 6)
  const ratingRows = visibleStores.length
    ? await db.storeReview.findMany({
        where: { storeId: { in: visibleStores.map((store) => store.id) }, blocked: false },
        select: { storeId: true, rating: true, user: { select: { name: true } } },
      })
    : []

  const ratingByStore = new Map<string, { total: number; count: number }>()
  for (const rating of ratingRows) {
    if (isDevelopmentReviewAuthor(rating.user.name)) continue
    const current = ratingByStore.get(rating.storeId) || { total: 0, count: 0 }
    current.total += rating.rating
    current.count += 1
    ratingByStore.set(rating.storeId, current)
  }

  const stores = visibleStores.map((store) => {
    const rating = ratingByStore.get(store.id)
    return {
      ...store,
      avgRating: rating?.count ? rating.total / rating.count : 0,
      reviewCount: rating?.count || 0,
    }
  })

  return { parts, stores }
}, ['home-marketplace-v2'], { revalidate: 60 })

export async function loadHomeMarketplaceData() {
  return loadHomeMarketplaceCached()
}
