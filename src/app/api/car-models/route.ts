import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Fetch all parts' carModels field and extract unique models
    const parts = await db.part.findMany({
    where: { blocked: false, carModels: { not: null } },
    select: { carModels: true },
  })

  const modelsSet = new Set<string>()
  parts.forEach((p) => {
    if (p.carModels) {
      p.carModels.split(',').forEach((m) => {
        const trimmed = m.trim()
        if (trimmed) modelsSet.add(trimmed)
      })
    }
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
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل موديلات السيارات' }, { status: 500 })
  }
}
