import 'server-only'

import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'

type PublicViewer = { id: string; role: string } | null

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
  compatibilities: Array<{ id: string; make: string; model: string; yearFrom: number | null; yearTo: number | null }>
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
      compatibilities: { select: { id: true, make: true, model: true, yearFrom: true, yearTo: true }, orderBy: [{ make: 'asc' }, { model: 'asc' }] },
    },
  })

  if (!record || record.blocked || isBlockedStoreName(record.store.name)) return { part: null, canReview: false }

  const canReview = viewer && ['BUYER', 'SHOP_OWNER'].includes(viewer.role)
    ? Boolean(await db.order.findFirst({
        where: {
          buyerId: viewer.id,
          status: { in: ['DELIVERED', 'RETURNED'] },
          OR: [{ partId }, { items: { some: { partId } } }],
        },
        select: { id: true },
      }))
    : false
  const { blocked: _blocked, store, reviews, ...part } = record
  void _blocked

  return {
    part: {
      ...part,
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
