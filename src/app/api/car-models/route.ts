import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [parts, compatibilities] = await Promise.all([
      db.part.findMany({
        where: { blocked: false, carModels: { not: null } },
        select: { carModels: true },
        take: 1000,
      }),
      db.vehicleCompatibility.findMany({
        where: { part: { blocked: false } },
        select: { make: true, model: true, generation: true, yearFrom: true, yearTo: true, engine: true, trim: true },
        orderBy: [{ make: 'asc' }, { model: 'asc' }],
        take: 2000,
      }),
    ])

  const modelsSet = new Set<string>()
  parts.forEach((p) => {
    if (p.carModels) {
      p.carModels.split(',').forEach((m) => {
        const trimmed = m.trim()
        if (trimmed) modelsSet.add(trimmed)
      })
    }
  })
  compatibilities.forEach((item) => {
    modelsSet.add([item.make, item.model, item.generation, item.yearFrom ? `${item.yearFrom}${item.yearTo ? `-${item.yearTo}` : ''}` : null, item.engine, item.trim].filter(Boolean).join(' '))
  })

  // Group by brand
  const models = Array.from(modelsSet).sort()
  const brands = new Map<string, string[]>()
  models.forEach((m) => {
    // First word is the brand
    const brand = m.split(' ')[0]
    if (!brands.has(brand)) brands.set(brand, [])
    brands.get(brand)!.push(m)
  })

  const grouped = Array.from(brands.entries())
    .map(([brand, models]) => ({ brand, models }))
    .sort((a, b) => a.brand.localeCompare(b.brand))

    return NextResponse.json(
      { models, grouped },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' } }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل موديلات السيارات' }, { status: 500 })
  }
}
