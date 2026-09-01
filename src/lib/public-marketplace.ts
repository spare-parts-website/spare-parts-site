import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BLOCKED_STORE_NAMES, isBlockedStoreName } from '@/lib/store-moderation'
import { evaluateFitment, type FitmentStatus, type VehicleProfile } from '@/lib/vehicle-compatibility'

type PublicViewer = { id: string; role: string } | null

export type PublicPartListItem = {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  category: string | null
  brand: string | null
  condition: string | null
  image: string | null
  carModels: string | null
  partNumber: string | null
  oemNumber: string | null
  universal: boolean
  fitmentNotes: string | null
  images: Array<{ id: string; url: string; position: number }>
  compatibilities: Array<{ id: string; make: string; model: string; generation: string | null; yearFrom: number | null; yearTo: number | null; engine: string | null; trim: string | null; notes: string | null }>
  compatibleWithSelectedCar: boolean
  fitmentStatus: FitmentStatus
  store: { id: string; name: string; image: string | null }
}

export type PublicPartsList = {
  parts: PublicPartListItem[]
  selectedCar: (VehicleProfile & { id?: string }) | null
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  categories: string[]
  brands: string[]
  conditions: string[]
}

export type PublicPartsQuery = {
  search?: string
  category?: string
  brand?: string
  condition?: string
  storeId?: string
  minPrice?: string | null
  maxPrice?: string | null
  carModel?: string
  carId?: string
  sort?: string
  page?: number
}

export type PublicStoreListItem = {
  id: string
  name: string
  description: string | null
  address: string | null
  phone: string | null
  image: string | null
  verified: boolean
  _count: { parts: number }
  avgRating: number
  reviewCount: number
  completedOrderCount: number
  completionRate: number | null
}

export type PublicStoresList = {
  stores: PublicStoreListItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const visibleStoreWhere: Prisma.StoreWhereInput = {
  NOT: BLOCKED_STORE_NAMES.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })),
}

function clean(value: string | undefined, max = 160) {
  return (value || '').trim().slice(0, max)
}

function publicPage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Math.min(Number(value), 10_000) : 1
}

export async function getPublicPartsList(query: PublicPartsQuery, viewer: PublicViewer): Promise<PublicPartsList> {
  const page = publicPage(query.page)
  const pageSize = 24
  const search = clean(query.search)
  const category = clean(query.category, 120)
  const brand = clean(query.brand, 120)
  const condition = clean(query.condition, 120)
  const storeId = clean(query.storeId, 100)
  const carModel = clean(query.carModel, 160)
  const carId = clean(query.carId, 100)
  const sort = clean(query.sort, 30) || 'newest'
  const minPrice = query.minPrice ? Number(query.minPrice) : null
  const maxPrice = query.maxPrice ? Number(query.maxPrice) : null
  const where: Prisma.PartWhereInput = { blocked: false, store: { is: visibleStoreWhere } }
  const and: Prisma.PartWhereInput[] = []
  let selectedCar: PublicPartsList['selectedCar'] = null

  if (carId && viewer) {
    selectedCar = await db.userCar.findFirst({
      where: { id: carId, userId: viewer.id },
      select: { brand: true, model: true, generation: true, year: true, engine: true, trim: true },
    })
    if (selectedCar) {
      const compatibilityAnd: Prisma.VehicleCompatibilityWhereInput[] = [
        selectedCar.year
          ? { AND: [{ OR: [{ yearFrom: null }, { yearFrom: { lte: selectedCar.year } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: selectedCar.year } }] }] }
          : { yearFrom: null, yearTo: null },
        selectedCar.generation
          ? { OR: [{ generation: null }, { generation: { equals: selectedCar.generation, mode: 'insensitive' } }] }
          : { generation: null },
        selectedCar.engine
          ? { OR: [{ engine: null }, { engine: { equals: selectedCar.engine, mode: 'insensitive' } }] }
          : { engine: null },
        selectedCar.trim
          ? { OR: [{ trim: null }, { trim: { equals: selectedCar.trim, mode: 'insensitive' } }] }
          : { trim: null },
      ]
      and.push({
        OR: [
          { universal: true },
          { compatibilities: { some: { make: { equals: selectedCar.brand, mode: 'insensitive' }, model: { equals: selectedCar.model, mode: 'insensitive' }, AND: compatibilityAnd } } },
        ],
      })
    }
  }
  if (search) {
    const searchFilters: Prisma.PartWhereInput[] = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { condition: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { partNumber: { contains: search, mode: 'insensitive' } },
      { oemNumber: { contains: search, mode: 'insensitive' } },
      { searchAliases: { contains: search, mode: 'insensitive' } },
      { store: { is: { name: { contains: search, mode: 'insensitive' } } } },
      { compatibilities: { some: { OR: [
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { generation: { contains: search, mode: 'insensitive' } },
        { engine: { contains: search, mode: 'insensitive' } },
        { trim: { contains: search, mode: 'insensitive' } },
      ] } } },
    ]
    const searchYear = /^\d{4}$/.test(search) ? Number(search) : null
    if (searchYear && searchYear >= 1950 && searchYear <= new Date().getFullYear() + 2) {
      searchFilters.push({ compatibilities: { some: { AND: [{ OR: [{ yearFrom: null }, { yearFrom: { lte: searchYear } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: searchYear } }] }] } } })
    }
    where.OR = searchFilters
  }
  if (category) where.category = category
  if (brand) where.brand = brand
  if (condition) where.condition = condition
  if (storeId) where.storeId = storeId
  const price: Prisma.FloatFilter = {}
  if (Number.isFinite(minPrice)) price.gte = Number(minPrice)
  if (Number.isFinite(maxPrice)) price.lte = Number(maxPrice)
  if (price.gte !== undefined || price.lte !== undefined) where.price = price
  if (carModel) {
    and.push({
      OR: [
        { carModels: { contains: carModel, mode: 'insensitive' } },
        { compatibilities: { some: { OR: [{ make: { contains: carModel, mode: 'insensitive' } }, { model: { contains: carModel, mode: 'insensitive' } }] } } },
      ],
    })
  }
  if (and.length) where.AND = and

  const orderBy: Prisma.PartOrderByWithRelationInput = sort === 'price-asc'
    ? { price: 'asc' }
    : sort === 'price-desc'
      ? { price: 'desc' }
      : sort === 'name'
        ? { name: 'asc' }
        : { createdAt: 'desc' }

  const publicPartSelect = {
    id: true, name: true, description: true, price: true, stock: true,
    category: true, brand: true, condition: true, image: true, carModels: true, partNumber: true, oemNumber: true, universal: true, fitmentNotes: true,
    images: { select: { id: true, url: true, position: true }, orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
    compatibilities: { select: { id: true, make: true, model: true, generation: true, yearFrom: true, yearTo: true, engine: true, trim: true, notes: true } },
    store: { select: { id: true, name: true, image: true } },
  } satisfies Prisma.PartSelect

  const facetBase: Prisma.PartWhereInput = { blocked: false, store: { is: visibleStoreWhere } }
  const [records, total, categories, brands, conditions] = await Promise.all([
    db.part.findMany({ where, select: publicPartSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.part.count({ where }),
    db.part.findMany({ where: { ...facetBase, category: { not: null } }, distinct: ['category'], select: { category: true }, take: 100 }),
    db.part.findMany({ where: { ...facetBase, brand: { not: null } }, distinct: ['brand'], select: { brand: true }, take: 100 }),
    db.part.findMany({ where: { ...facetBase, condition: { not: null } }, distinct: ['condition'], select: { condition: true }, orderBy: { condition: 'asc' }, take: 100 }),
  ])

  return {
    parts: records.filter((part) => !isBlockedStoreName(part.store.name)).map((part) => {
      const fitmentStatus = evaluateFitment(part, selectedCar)
      return { ...part, fitmentStatus, compatibleWithSelectedCar: fitmentStatus === 'fits' }
    }),
    selectedCar,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    categories: categories.map((item) => item.category).filter((item): item is string => Boolean(item)),
    brands: brands.map((item) => item.brand).filter((item): item is string => Boolean(item)),
    conditions: conditions.map((item) => item.condition).filter((item): item is string => Boolean(item)),
  }
}

export async function getPublicStoresList(searchValue = '', pageValue = 1): Promise<PublicStoresList> {
  const search = clean(searchValue)
  const page = publicPage(pageValue)
  const pageSize = 18
  const where: Prisma.StoreWhereInput = {
    ...visibleStoreWhere,
    ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {}),
  }

  const [records, total] = await Promise.all([
    db.store.findMany({
      where,
      select: {
        id: true, name: true, description: true, address: true, phone: true, image: true, verified: true,
        _count: { select: { parts: { where: { blocked: false } }, orders: { where: { status: 'DELIVERED' } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.store.count({ where }),
  ])
  const stores = records.filter((store) => !isBlockedStoreName(store.name))
  const ids = stores.map((store) => store.id)
  const [reviewGroups, decidedGroups] = ids.length
    ? await Promise.all([
        db.storeReview.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, blocked: false }, _avg: { rating: true }, _count: { _all: true } }),
        db.order.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } }, _count: { _all: true } }),
      ])
    : [[], []]
  const reviewByStore = new Map(reviewGroups.map((review) => [review.storeId, review]))
  const decidedByStore = new Map(decidedGroups.map((item) => [item.storeId, item._count._all]))

  return {
    stores: stores.map((store) => {
      const review = reviewByStore.get(store.id)
      const decided = decidedByStore.get(store.id) || 0
      return {
        id: store.id,
        name: store.name,
        description: store.description,
        address: store.address,
        phone: store.phone,
        image: store.image,
        verified: store.verified,
        _count: { parts: store._count.parts },
        avgRating: review?._avg.rating || 0,
        reviewCount: review?._count._all || 0,
        completedOrderCount: store._count.orders,
        completionRate: decided ? Math.round(store._count.orders / decided * 100) : null,
      }
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

export type PublicPart = {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  category: string | null
  brand: string | null
  condition: string | null
  image: string | null
  carModels: string | null
  universal: boolean
  fitmentNotes: string | null
  compatibilities: Array<{ id: string; make: string; model: string; generation: string | null; yearFrom: number | null; yearTo: number | null; engine: string | null; trim: string | null; notes: string | null }>
  viewerFitment: { status: FitmentStatus; car: VehicleProfile | null }
  store: {
    id: string
    name: string
    address: string | null
    phone: string | null
    image: string | null
    verified: boolean
    isOwnedByViewer: boolean
  }
  reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; user: { name: string; avatar: string | null } }>
  images: Array<{ id: string; url: string; position: number }>
}

export type PublicStore = {
  id: string
  name: string
  description: string | null
  address: string | null
  phone: string | null
  image: string | null
  verified: boolean
  parts: Array<{ id: string; name: string; price: number; stock: number; category: string | null; brand: string | null; image: string | null }>
  reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; user: { name: string; avatar: string | null } }>
  completedOrderCount: number
  completionRate: number | null
}

export async function getPublicPart(partId: string, viewer: PublicViewer): Promise<{ part: PublicPart | null; canReview: boolean }> {
  const record = await db.part.findUnique({
    where: { id: partId },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      stock: true,
      category: true,
      brand: true,
      condition: true,
      image: true,
      carModels: true,
      universal: true,
      fitmentNotes: true,
      blocked: true,
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          image: true,
          verified: true,
          ownerId: true,
        },
      },
      reviews: {
        where: { blocked: false },
        select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      },
      images: { select: { id: true, url: true, position: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      compatibilities: { select: { id: true, make: true, model: true, generation: true, yearFrom: true, yearTo: true, engine: true, trim: true, notes: true }, orderBy: [{ make: 'asc' }, { model: 'asc' }] },
    },
  })

  if (!record || record.blocked || isBlockedStoreName(record.store.name)) return { part: null, canReview: false }

  const [canReview, primaryCar] = await Promise.all([
    viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role)
      ? db.order.findFirst({ where: { buyerId: viewer.id, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId }, { items: { some: { partId } } }] }, select: { id: true } }).then(Boolean)
      : false,
    viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role)
      ? db.userCar.findFirst({ where: { userId: viewer.id, isPrimary: true }, select: { brand: true, model: true, generation: true, year: true, engine: true, trim: true } })
      : null,
  ])
  const { blocked: _blocked, store, reviews, ...part } = record
  void _blocked

  return {
    part: {
      ...part,
      viewerFitment: { status: evaluateFitment(record, primaryCar), car: primaryCar },
      store: {
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        image: store.image,
        verified: store.verified,
        isOwnedByViewer: viewer?.id === store.ownerId,
      },
      reviews: reviews.map((review) => ({ ...review, createdAt: review.createdAt.toISOString() })),
    },
    canReview,
  }
}

export async function getPublicStore(storeId: string, viewer: PublicViewer): Promise<{ store: PublicStore | null; canReview: boolean }> {
  const record = await db.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      phone: true,
      image: true,
      verified: true,
      parts: {
        where: { blocked: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, price: true, stock: true, category: true, brand: true, image: true },
      },
      reviews: {
        where: { blocked: false },
        select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!record || isBlockedStoreName(record.name)) return { store: null, canReview: false }

  const [completedOrderCount, decidedOrderCount, canReview] = await Promise.all([
    db.order.count({ where: { storeId, status: 'DELIVERED' } }),
    db.order.count({ where: { storeId, status: { in: ['DELIVERED', 'RETURNED', 'REJECTED', 'CANCELLED'] } } }),
    viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role)
      ? db.order.findFirst({ where: { buyerId: viewer.id, storeId, status: { in: ['DELIVERED', 'RETURNED'] } }, select: { id: true } }).then(Boolean)
      : false,
  ])

  return {
    store: {
      ...record,
      reviews: record.reviews.map((review) => ({ ...review, createdAt: review.createdAt.toISOString() })),
      completedOrderCount,
      completionRate: decidedOrderCount ? Math.round(completedOrderCount / decidedOrderCount * 100) : null,
    },
    canReview,
  }
}
