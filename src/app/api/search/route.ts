import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/search?q=query - returns matching parts, stores, and car models
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''

  if (!q || q.length < 1) {
    return NextResponse.json({ parts: [], stores: [], carModels: [] })
  }

  const [parts, stores, partsWithCars] = await Promise.all([
    db.part.findMany({
      where: {
        blocked: false,
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { brand: { contains: q } },
          { carModels: { contains: q } },
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
      where: { blocked: false, carModels: { contains: q } },
      select: { carModels: true },
      take: 50,
    }),
  ])

  // Get matching car models
  const carModelsSet = new Set<string>()
  partsWithCars.forEach((p) => {
    if (p.carModels) {
      p.carModels.split(',').forEach((m) => {
        const t = m.trim()
        if (t.toLowerCase().includes(q.toLowerCase())) carModelsSet.add(t)
      })
    }
  })

  return NextResponse.json(
    { parts, stores, carModels: Array.from(carModelsSet).slice(0, 8) },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=30, stale-while-revalidate=60' } },
  )
}
