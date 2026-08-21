import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// GET /api/search?q=query - returns matching parts, stores, and car models
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''

  if (!q || q.length < 1) {
    return NextResponse.json({ parts: [], stores: [], carModels: [] })
  }

  const [exactParts, stores, partsWithCars] = await Promise.all([
    db.part.findMany({
      where: {
        blocked: false,
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { brand: { contains: q } },
          { partNumber: { contains: q } },
          { oemNumber: { contains: q } },
          { searchAliases: { contains: q } },
          { carModels: { contains: q } },
          { compatibilities: { some: { OR: [{ make: { contains: q } }, { model: { contains: q } }] } } },
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
        OR: [{ name: { contains: q } }, { description: { contains: q } }],
      },
      take: 5,
      select: { id: true, name: true, description: true },
    }),
    db.part.findMany({
      where: {
        blocked: false,
        OR: [
          { carModels: { contains: q } },
          { compatibilities: { some: { OR: [{ make: { contains: q } }, { model: { contains: q } }] } } },
        ],
      },
      select: { carModels: true, compatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } } },
      take: 50,
    }),
  ])

  let parts = exactParts
  if (parts.length < 8 && q.trim().length >= 3) {
    try {
      const fuzzy = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        select "id" from public."Part"
        where "blocked" = false and extensions.similarity(
          coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("brand", '') || ' ' ||
          coalesce("partNumber", '') || ' ' || coalesce("oemNumber", '') || ' ' || coalesce("searchAliases", ''), ${q}
        ) > 0.16
        order by extensions.similarity(coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("partNumber", '') || ' ' || coalesce("oemNumber", '') || ' ' || coalesce("searchAliases", ''), ${q}) desc
        limit 8
      `)
      const missingIds = fuzzy.map((item) => item.id).filter((id) => !parts.some((part) => part.id === id))
      if (missingIds.length) {
        const matches = await db.part.findMany({ where: { id: { in: missingIds }, blocked: false }, select: { id: true, name: true, price: true, image: true, category: true, brand: true, store: { select: { id: true, name: true } } } })
        parts = [...parts, ...matches].slice(0, 8)
      }
    } catch { /* Exact search remains available before pg_trgm is installed. */ }
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
