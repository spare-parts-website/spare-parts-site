import 'server-only'

import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { isDevelopmentReviewAuthor } from '@/lib/review-moderation'

export type HomeMarketplacePart = { id: string; name: string; price: number; stock: number; brand: string | null; condition: string | null; image: string | null; store: { id: string; name: string; image: string | null; verified: boolean } }
export type HomeMarketplaceStore = { id: string; name: string; description: string | null; image: string | null; verified: boolean; _count: { parts: number }; avgRating: number; reviewCount: number }
export type HomeMarketplacePayload = { parts: HomeMarketplacePart[]; stores: HomeMarketplaceStore[] }

const loadHomeMarketplaceCached = unstable_cache(async (): Promise<HomeMarketplacePayload> => {
  const [parts, stores] = await Promise.all([
    db.part.findMany({ where: { moderationStatus: 'ACTIVE', store: { moderationStatus: 'ACTIVE' } }, select: { id: true, name: true, price: true, stock: true, brand: true, condition: true, image: true, store: { select: { id: true, name: true, image: true, verified: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    db.store.findMany({ where: { moderationStatus: 'ACTIVE', parts: { some: { moderationStatus: 'ACTIVE' } } }, select: { id: true, name: true, description: true, image: true, verified: true, _count: { select: { parts: { where: { moderationStatus: 'ACTIVE' } } } } }, orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }], take: 6 }),
  ])
  const ratingRows = stores.length ? await db.storeReview.findMany({ where: { storeId: { in: stores.map((store) => store.id) }, blocked: false }, select: { storeId: true, rating: true, user: { select: { name: true } } } }) : []
  const ratingByStore = new Map<string, { total: number; count: number }>()
  for (const rating of ratingRows) { if (isDevelopmentReviewAuthor(rating.user.name)) continue; const current = ratingByStore.get(rating.storeId) || { total: 0, count: 0 }; current.total += rating.rating; current.count += 1; ratingByStore.set(rating.storeId, current) }
  return { parts, stores: stores.map((store) => { const rating = ratingByStore.get(store.id); return { ...store, avgRating: rating?.count ? rating.total / rating.count : 0, reviewCount: rating?.count || 0 } }) }
}, ['home-marketplace-v3'], { revalidate: 120 })

export async function loadHomeMarketplaceData() { return loadHomeMarketplaceCached() }
