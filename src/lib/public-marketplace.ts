import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { detectMarketplaceBrandHint, findTypoTolerantPartIds, findTypoTolerantStoreIds } from '@/lib/marketplace-search'

type PublicViewer = { id: string; role: string } | null

export type PublicPartListItem = {
  id: string; name: string; description: string | null; price: number; stock: number; category: string | null; brand: string | null; condition: string | null; image: string | null; carModels: string | null; partNumber: string | null; oemNumber: string | null; universal: boolean; fitmentNotes: string | null
  images: Array<{ id: string; url: string; position: number }>
  compatibilities: Array<{ id: string; make: string; model: string; generation: string | null; yearFrom: number | null; yearTo: number | null; engine: string | null; trim: string | null; notes: string | null }>
  store: { id: string; name: string; image: string | null; verified: boolean }
}
export type PublicPartsList = { parts: PublicPartListItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; categories: string[]; brands: string[]; conditions: string[] }
export type PublicPartsQuery = { search?: string; category?: string; brand?: string; condition?: string; storeId?: string; minPrice?: string | null; maxPrice?: string | null; carModel?: string; sort?: string; page?: number }
export type PublicStoreListItem = { id: string; name: string; description: string | null; address: string | null; phone: string | null; image: string | null; verified: boolean; _count: { parts: number }; avgRating: number; reviewCount: number; completedOrderCount: number; completionRate: number | null }
export type PublicStoresList = { stores: PublicStoreListItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }

const visibleStoreWhere: Prisma.StoreWhereInput = { moderationStatus: 'ACTIVE' }
const listableStoreWhere: Prisma.StoreWhereInput = { ...visibleStoreWhere, parts: { some: { blocked: false } } }
function clean(value: string | undefined, max = 160) { return (value || '').trim().slice(0, max) }
function publicPage(value: number | undefined) { return Number.isInteger(value) && Number(value) > 0 ? Math.min(Number(value), 10_000) : 1 }

const loadPublicPartFacets = unstable_cache(async () => {
  const facetBase: Prisma.PartWhereInput = { blocked: false, store: { is: visibleStoreWhere } }
  const [categories, brands, conditions] = await Promise.all([
    db.part.findMany({ where: { ...facetBase, category: { not: null } }, distinct: ['category'], select: { category: true }, take: 100 }),
    db.part.findMany({ where: { ...facetBase, brand: { not: null } }, distinct: ['brand'], select: { brand: true }, take: 100 }),
    db.part.findMany({ where: { ...facetBase, condition: { not: null } }, distinct: ['condition'], select: { condition: true }, orderBy: { condition: 'asc' }, take: 100 }),
  ])
  return { categories: categories.map((item) => item.category).filter((item): item is string => Boolean(item)), brands: brands.map((item) => item.brand).filter((item): item is string => Boolean(item)), conditions: conditions.map((item) => item.condition).filter((item): item is string => Boolean(item)) }
}, ['public-part-facets-v3'], { revalidate: 300 })

function isDefaultPartsQuery(query: PublicPartsQuery) {
  return publicPage(query.page) === 1 && !clean(query.search) && !clean(query.category, 120) && !clean(query.brand, 120) && !clean(query.condition, 120) && !clean(query.storeId, 100) && !clean(query.carModel, 160) && !query.minPrice && !query.maxPrice && (clean(query.sort, 30) || 'newest') === 'newest'
}

async function buildPublicPartsList(query: PublicPartsQuery): Promise<PublicPartsList> {
  const page = publicPage(query.page); const pageSize = 24; const search = clean(query.search); const category = clean(query.category, 120); const brand = clean(query.brand, 120); const condition = clean(query.condition, 120); const storeId = clean(query.storeId, 100); const carModel = clean(query.carModel, 160); const sort = clean(query.sort, 30) || 'newest'
  const brandHint = search ? detectMarketplaceBrandHint(search) : null
  const minPrice = query.minPrice ? Number(query.minPrice) : null; const maxPrice = query.maxPrice ? Number(query.maxPrice) : null
  const fuzzyPartIds = search ? await findTypoTolerantPartIds(search, 200) : []
  const where: Prisma.PartWhereInput = { blocked: false, store: { is: visibleStoreWhere } }
  const and: Prisma.PartWhereInput[] = []
  if (search) {
    const searchFilters: Prisma.PartWhereInput[] = [
      { name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { brand: { contains: search, mode: 'insensitive' } }, { condition: { contains: search, mode: 'insensitive' } }, { category: { contains: search, mode: 'insensitive' } }, { partNumber: { contains: search, mode: 'insensitive' } }, { oemNumber: { contains: search, mode: 'insensitive' } }, { searchAliases: { contains: search, mode: 'insensitive' } }, { store: { is: { ...visibleStoreWhere, name: { contains: search, mode: 'insensitive' } } } },
      { compatibilities: { some: { OR: [{ make: { contains: search, mode: 'insensitive' } }, { model: { contains: search, mode: 'insensitive' } }, { generation: { contains: search, mode: 'insensitive' } }, { engine: { contains: search, mode: 'insensitive' } }, { trim: { contains: search, mode: 'insensitive' } }] } } },
    ]
    if (fuzzyPartIds.length) searchFilters.push({ id: { in: fuzzyPartIds } })
    const searchYear = /^\d{4}$/.test(search) ? Number(search) : null
    if (searchYear && searchYear >= 1950 && searchYear <= new Date().getFullYear() + 2) searchFilters.push({ compatibilities: { some: { AND: [{ OR: [{ yearFrom: null }, { yearFrom: { lte: searchYear } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: searchYear } }] }] } } })
    where.OR = searchFilters
  }
  if (category) where.category = category; if (brand) where.brand = brand; if (condition) where.condition = condition; if (storeId) where.storeId = storeId
  const price: Prisma.FloatFilter = {}; if (Number.isFinite(minPrice)) price.gte = Number(minPrice); if (Number.isFinite(maxPrice)) price.lte = Number(maxPrice); if (price.gte !== undefined || price.lte !== undefined) where.price = price
  if (carModel) and.push({ OR: [{ carModels: { contains: carModel, mode: 'insensitive' } }, { compatibilities: { some: { OR: [{ make: { contains: carModel, mode: 'insensitive' } }, { model: { contains: carModel, mode: 'insensitive' } }] } } }] })
  if (brandHint) and.push({ OR: [{ brand: { contains: brandHint, mode: 'insensitive' } }, { name: { contains: brandHint, mode: 'insensitive' } }, { description: { contains: brandHint, mode: 'insensitive' } }, { searchAliases: { contains: brandHint, mode: 'insensitive' } }, { carModels: { contains: brandHint, mode: 'insensitive' } }, { compatibilities: { some: { make: { contains: brandHint, mode: 'insensitive' } } } }] })
  if (and.length) where.AND = and
  const orderBy: Prisma.PartOrderByWithRelationInput = sort === 'price-asc' ? { price: 'asc' } : sort === 'price-desc' ? { price: 'desc' } : sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' }
  const publicPartSelect = { id: true, name: true, description: true, price: true, stock: true, category: true, brand: true, condition: true, image: true, carModels: true, partNumber: true, oemNumber: true, universal: true, fitmentNotes: true, images: { select: { id: true, url: true, position: true }, orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] }, compatibilities: { select: { id: true, make: true, model: true, generation: true, yearFrom: true, yearTo: true, engine: true, trim: true, notes: true } }, store: { select: { id: true, name: true, image: true, verified: true } } } satisfies Prisma.PartSelect
  const rankSearchResults = Boolean(search && fuzzyPartIds.length && page <= Math.ceil(fuzzyPartIds.length / pageSize))
  const [total, facets] = await Promise.all([db.part.count({ where }), loadPublicPartFacets()])
  let records: PublicPartListItem[]
  if (rankSearchResults) {
    // Keep relevance ranking in the database helper, but hydrate only the IDs
    // needed for this page instead of materializing hundreds of full records.
    const candidates = await db.part.findMany({ where: { ...where, id: { in: fuzzyPartIds } }, select: { id: true } })
    const allowed = new Set(candidates.map((item) => item.id))
    const pageIds = fuzzyPartIds.filter((id) => allowed.has(id)).slice((page - 1) * pageSize, page * pageSize)
    const hydrated = pageIds.length ? await db.part.findMany({ where: { id: { in: pageIds }, blocked: false, store: { is: visibleStoreWhere } }, select: publicPartSelect }) : []
    const byId = new Map(hydrated.map((item) => [item.id, item]))
    records = pageIds.map((id) => byId.get(id)).filter((item): item is PublicPartListItem => Boolean(item))
  } else {
    records = await db.part.findMany({ where, select: publicPartSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize })
  }
  return { parts: records, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, categories: facets.categories, brands: facets.brands, conditions: facets.conditions }
}

const loadDefaultPublicPartsList = unstable_cache(() => buildPublicPartsList({ sort: 'newest', page: 1 }), ['public-parts-default-v3'], { revalidate: 30 })
export async function getPublicPartsList(query: PublicPartsQuery): Promise<PublicPartsList> { return isDefaultPartsQuery(query) ? loadDefaultPublicPartsList() : buildPublicPartsList(query) }

async function buildPublicStoresList(searchValue = '', pageValue = 1): Promise<PublicStoresList> {
  const search = clean(searchValue); const page = publicPage(pageValue); const pageSize = 18; const fuzzyStoreIds = search ? await findTypoTolerantStoreIds(search) : []
  const where: Prisma.StoreWhereInput = { ...listableStoreWhere, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, ...(fuzzyStoreIds.length ? [{ id: { in: fuzzyStoreIds } }] : [])] } : {}) }
  const [stores, total] = await Promise.all([db.store.findMany({ where, select: { id: true, name: true, description: true, address: true, phone: true, image: true, verified: true, _count: { select: { parts: { where: { blocked: false } }, orders: { where: { status: 'DELIVERED' } } } } }, orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), db.store.count({ where })])
  const ids = stores.map((store) => store.id)
  const [reviewGroups, decidedGroups] = ids.length ? await Promise.all([db.storeReview.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, blocked: false }, _avg: { rating: true }, _count: { rating: true } }), db.order.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } }, _count: { _all: true } })]) : [[], []]
  const reviewByStore = new Map(reviewGroups.map((item) => [item.storeId, { avgRating: item._avg.rating || 0, reviewCount: item._count.rating }]))
  const decidedByStore = new Map(decidedGroups.map((item) => [item.storeId, item._count._all]))
  return { stores: stores.map((store) => { const review = reviewByStore.get(store.id) || { avgRating: 0, reviewCount: 0 }; const decided = decidedByStore.get(store.id) || 0; return { id: store.id, name: store.name, description: store.description, address: store.address, phone: store.phone, image: store.image, verified: store.verified, _count: { parts: store._count.parts }, avgRating: review.avgRating, reviewCount: review.reviewCount, completedOrderCount: store._count.orders, completionRate: decided ? Math.round(store._count.orders / decided * 100) : null } }), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}
const loadDefaultPublicStoresList = unstable_cache(() => buildPublicStoresList('', 1), ['public-stores-default-v3'], { revalidate: 30 })
export async function getPublicStoresList(searchValue = '', pageValue = 1): Promise<PublicStoresList> { return !clean(searchValue) && publicPage(pageValue) === 1 ? loadDefaultPublicStoresList() : buildPublicStoresList(searchValue, pageValue) }

export type PublicPart = { id: string; name: string; description: string | null; price: number; stock: number; category: string | null; brand: string | null; condition: string | null; image: string | null; carModels: string | null; partNumber: string | null; oemNumber: string | null; universal: boolean; fitmentNotes: string | null; compatibilities: Array<{ id: string; make: string; model: string; generation: string | null; yearFrom: number | null; yearTo: number | null; engine: string | null; trim: string | null; notes: string | null }>; store: { id: string; name: string; address: string | null; phone: string | null; image: string | null; verified: boolean; isOwnedByViewer: boolean }; reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; verifiedPurchase: boolean; user: { name: string; avatar: string | null } }>; images: Array<{ id: string; url: string; position: number }> }
export type PublicStore = { id: string; name: string; description: string | null; address: string | null; phone: string | null; image: string | null; verified: boolean; createdAt: string; parts: Array<{ id: string; name: string; price: number; stock: number; category: string | null; brand: string | null; image: string | null }>; reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; user: { name: string; avatar: string | null } }>; partCount: number; avgRating: number; reviewCount: number; completedOrderCount: number; completionRate: number | null }

export async function getPublicPart(partId: string, viewer: PublicViewer): Promise<{ part: PublicPart | null; canReview: boolean }> {
  const record = await db.part.findUnique({ where: { id: partId }, select: { id: true, name: true, description: true, price: true, stock: true, category: true, brand: true, condition: true, image: true, carModels: true, partNumber: true, oemNumber: true, universal: true, fitmentNotes: true, blocked: true, store: { select: { id: true, name: true, address: true, phone: true, image: true, verified: true, ownerId: true, moderationStatus: true } }, reviews: { where: { blocked: false }, select: { id: true, rating: true, comment: true, createdAt: true, orderId: true, userId: true, user: { select: { name: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }, images: { select: { id: true, url: true, position: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, compatibilities: { select: { id: true, make: true, model: true, generation: true, yearFrom: true, yearTo: true, engine: true, trim: true, notes: true }, orderBy: [{ make: 'asc' }, { model: 'asc' }] } } })
  if (!record || record.blocked || record.store.moderationStatus !== 'ACTIVE') return { part: null, canReview: false }
  const canReview = await (viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role) ? db.order.findFirst({ where: { buyerId: viewer.id, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId }, { items: { some: { partId } } }] }, select: { id: true } }).then(Boolean) : Promise.resolve(false))
  const reviewOrderIds = record.reviews.map((review) => review.orderId).filter((id): id is string => Boolean(id))
  const qualifyingOrders = reviewOrderIds.length ? await db.order.findMany({ where: { id: { in: reviewOrderIds }, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId }, { items: { some: { partId } } }] }, select: { id: true, buyerId: true } }) : []
  const qualifyingReviewKeys = new Set(qualifyingOrders.map((order) => `${order.buyerId}:${order.id}`))
  const { blocked: _blocked, store, reviews: storedReviews, ...part } = record; void _blocked
  return { part: { ...part, store: { id: store.id, name: store.name, address: store.address, phone: store.phone, image: store.image, verified: store.verified, isOwnedByViewer: viewer?.id === store.ownerId }, reviews: storedReviews.map(({ orderId, userId, ...review }) => ({ ...review, verifiedPurchase: Boolean(orderId && qualifyingReviewKeys.has(`${userId}:${orderId}`)), createdAt: review.createdAt.toISOString() })) }, canReview }
}

export async function getPublicStore(storeId: string, viewer: PublicViewer): Promise<{ store: PublicStore | null; canReview: boolean }> {
  const record = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, description: true, address: true, phone: true, image: true, verified: true, moderationStatus: true, createdAt: true, parts: { where: { blocked: false }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, price: true, stock: true, category: true, brand: true, image: true }, take: 24 }, reviews: { where: { blocked: false }, select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 20 } } })
  if (!record || record.moderationStatus !== 'ACTIVE') return { store: null, canReview: false }
  const [partCount, rating, completedOrderCount, decidedOrderCount, canReview] = await Promise.all([db.part.count({ where: { storeId, blocked: false } }), db.storeReview.aggregate({ where: { storeId, blocked: false }, _avg: { rating: true }, _count: { rating: true } }), db.order.count({ where: { storeId, status: 'DELIVERED' } }), db.order.count({ where: { storeId, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } } }), viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role) ? db.order.findFirst({ where: { buyerId: viewer.id, storeId, status: { in: ['DELIVERED', 'RETURNED'] } }, select: { id: true } }).then(Boolean) : false])
  const { moderationStatus: _moderationStatus, ...publicRecord } = record; void _moderationStatus
  return { store: { ...publicRecord, createdAt: record.createdAt.toISOString(), reviews: record.reviews.map((review) => ({ ...review, createdAt: review.createdAt.toISOString() })), partCount, avgRating: rating._avg.rating || 0, reviewCount: rating._count.rating, completedOrderCount, completionRate: decidedOrderCount ? Math.round(completedOrderCount / decidedOrderCount * 100) : null }, canReview }
}
