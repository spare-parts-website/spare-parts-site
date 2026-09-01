import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findTypoTolerantPartIds, findTypoTolerantStoreIds } from '@/lib/marketplace-search'
import { BLOCKED_STORE_NAMES } from '@/lib/store-moderation'

// GET /api/search?q=query - returns matching parts, stores, and car models
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().slice(0, 100)

  if (!q || q.length < 1) {
    return NextResponse.json({ parts: [], stores: [], carModels: [] })
  }

  const [fuzzyPartIds, fuzzyStoreIds] = await Promise.all([
    findTypoTolerantPartIds(q, 30),
    findTypoTolerantStoreIds(q, 20),
  ])
  const visibleStores = { NOT: BLOCKED_STORE_NAMES.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) }

  const [exactParts, stores, partsWithCars] = await Promise.all([
    db.part.findMany({
      where: {
        blocked: false,
        store: { is: visibleStores },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { partNumber: { contains: q, mode: 'insensitive' } },
          { oemNumber: { contains: q, mode: 'insensitive' } },
          { searchAliases: { contains: q, mode: 'insensitive' } },
          { carModels: { contains: q, mode: 'insensitive' } },
          { compatibilities: { some: { OR: [{ make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } } },
        ],
      },
      take: 8,
      select: {
        id: true, name: true, price: true, image: true, category: true, brand: true,
        store: { select: { id: true, name: true } },
      },
    }),
    db.store.findMany({
      where: {
        ...visibleStores,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          ...(fuzzyStoreIds.length ? [{ id: { in: fuzzyStoreIds } }] : []),
        ],
      },
      take: 5,
      select: { id: true, name: true, description: true },
    }),
    db.part.findMany({
      where: {
        blocked: false,
        store: { is: visibleStores },
        OR: [
          { carModels: { contains: q, mode: 'insensitive' } },
          { compatibilities: { some: { OR: [{ make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } } },
          ...(fuzzyPartIds.length ? [{ id: { in: fuzzyPartIds } }] : []),
        ],
      },
      select: { carModels: true, compatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } } },
      take: 50,
    }),
  ])

  let parts = exactParts
  if (parts.length < 8 && fuzzyPartIds.length) {
    const missingIds = fuzzyPartIds.filter((id) => !parts.some((part) => part.id === id)).slice(0, 8 - parts.length)
    if (missingIds.length) {
      const matches = await db.part.findMany({ where: { id: { in: missingIds }, blocked: false, store: { is: visibleStores } }, select: { id: true, name: true, price: true, image: true, category: true, brand: true, store: { select: { id: true, name: true } } } })
      const byId = new Map(matches.map((part) => [part.id, part]))
      parts = [...parts, ...missingIds.map((id) => byId.get(id)).filter((part): part is NonNullable<typeof part> => Boolean(part))].slice(0, 8)
    }
  }

  // Get matching car models
  const carModelsSet = new Set<string>()
  partsWithCars.forEach((p) => {
    if (p.carModels) {
      p.carModels.split(',').forEach((m) => {
        const t = m.trim()
        if (t.toLowerCase().includes(q.toLowerCase())) carModelsSet.add(t)
      })
    }
    p.compatibilities.forEach((item) => {
      const value = `${item.make} ${item.model}${item.yearFrom ? ` ${item.yearFrom}${item.yearTo ? `-${item.yearTo}` : ''}` : ''}`
      if (value.toLowerCase().includes(q.toLowerCase())) carModelsSet.add(value)
    })
  })

  return NextResponse.json(
    { parts, stores, carModels: Array.from(carModelsSet).slice(0, 8) },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=30, stale-while-revalidate=60' } },
  )
}
