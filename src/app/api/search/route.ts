import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { detectMarketplaceBrandHint, findTypoTolerantPartIds, findTypoTolerantStoreIds } from '@/lib/marketplace-search'

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100)
  if (!q) return NextResponse.json({ parts: [], stores: [], carModels: [] })
  const [fuzzyPartIds, fuzzyStoreIds] = await Promise.all([findTypoTolerantPartIds(q, 30), findTypoTolerantStoreIds(q, 20)])
  const brandHint = detectMarketplaceBrandHint(q)
  const visibleStores = { moderationStatus: 'ACTIVE' as const }
  const brandPrecisionGuard = brandHint ? { OR: [{ brand: { contains: brandHint, mode: 'insensitive' as const } }, { name: { contains: brandHint, mode: 'insensitive' as const } }, { description: { contains: brandHint, mode: 'insensitive' as const } }, { searchAliases: { contains: brandHint, mode: 'insensitive' as const } }, { carModels: { contains: brandHint, mode: 'insensitive' as const } }, { compatibilities: { some: { make: { contains: brandHint, mode: 'insensitive' as const } } } }] } : undefined
  const [exactParts, stores, partsWithCars] = await Promise.all([
    db.part.findMany({ where: { moderationStatus: 'ACTIVE', store: { is: visibleStores }, ...(brandPrecisionGuard ? { AND: [brandPrecisionGuard] } : {}), OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { oemNumber: { contains: q, mode: 'insensitive' } }, { searchAliases: { contains: q, mode: 'insensitive' } }, { carModels: { contains: q, mode: 'insensitive' } }, { compatibilities: { some: { OR: [{ make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } } }] }, take: 8, select: { id: true, name: true, price: true, image: true, category: true, brand: true, store: { select: { id: true, name: true } } } }),
    db.store.findMany({ where: { ...visibleStores, OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, ...(fuzzyStoreIds.length ? [{ id: { in: fuzzyStoreIds } }] : [])] }, take: 5, select: { id: true, name: true, description: true } }),
    db.part.findMany({ where: { moderationStatus: 'ACTIVE', store: { is: visibleStores }, ...(brandPrecisionGuard ? { AND: [brandPrecisionGuard] } : {}), OR: [{ carModels: { contains: q, mode: 'insensitive' } }, { compatibilities: { some: { OR: [{ make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } } }, ...(fuzzyPartIds.length ? [{ id: { in: fuzzyPartIds } }] : [])] }, select: { carModels: true, compatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } } }, take: 50 }),
  ])
  let parts = exactParts
  if (parts.length < 8 && fuzzyPartIds.length) { const missingIds = fuzzyPartIds.filter((id) => !parts.some((part) => part.id === id)).slice(0, 8 - parts.length); if (missingIds.length) { const matches = await db.part.findMany({ where: { id: { in: missingIds }, moderationStatus: 'ACTIVE', store: { is: visibleStores }, ...(brandPrecisionGuard ? { AND: [brandPrecisionGuard] } : {}) }, select: { id: true, name: true, price: true, image: true, category: true, brand: true, store: { select: { id: true, name: true } } } }); const byId = new Map(matches.map((part) => [part.id, part])); parts = [...parts, ...missingIds.map((id) => byId.get(id)).filter((part): part is NonNullable<typeof part> => Boolean(part))].slice(0, 8) } }
  if (fuzzyPartIds.length) { const rank = new Map(fuzzyPartIds.map((id, index) => [id, index])); parts = parts.slice().sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)) }
  const carModelsSet = new Set<string>()
  partsWithCars.forEach((part) => { if (part.carModels) part.carModels.split(',').forEach((model) => { const value = model.trim(); if (value.toLowerCase().includes(q.toLowerCase())) carModelsSet.add(value) }); part.compatibilities.forEach((item) => { const value = `${item.make} ${item.model}${item.yearFrom ? ` ${item.yearFrom}${item.yearTo ? `-${item.yearTo}` : ''}` : ''}`; if (value.toLowerCase().includes(q.toLowerCase())) carModelsSet.add(value) }) })
  return NextResponse.json({ parts, stores, carModels: Array.from(carModelsSet).slice(0, 8) }, { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=30, stale-while-revalidate=60' } })
}
