import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { PartsView } from '@/components/views/parts-view'
import { getPublicPartsList, type PublicPartsList, type PublicPartsQuery } from '@/lib/public-marketplace'

export const metadata: Metadata = {
  title: 'قطع الغيار',
  description: 'تصفح قطع غيار السيارات المتاحة لدى متاجر غيار ماركت.',
  alternates: { canonical: 'https://ghyarmarket-eg.com/parts' },
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || '' : value || '' }
function boundedPage(value: string) { const parsed = Number.parseInt(value || '1', 10); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1 }

function PartsFallback() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><p className="text-sm text-muted-foreground">جاري تحميل قطع الغيار...</p></div>
}

export default async function PartsPage({ searchParams }: PageProps) {
  // Request rendering keeps the per-request CSP nonce while the data layer
  // independently caches safe public queries. Deep-link filters are resolved
  // here so HTML already matches the URL before hydration.
  await connection()
  const params = await searchParams
  const initialQuery: PublicPartsQuery = {
    search: first(params.search).trim().slice(0, 160),
    category: first(params.category).trim().slice(0, 120),
    brand: first(params.brand).trim().slice(0, 120),
    condition: first(params.condition).trim().slice(0, 120),
    storeId: first(params.storeId).trim().slice(0, 100),
    minPrice: first(params.minPrice) || null,
    maxPrice: first(params.maxPrice) || null,
    carModel: first(params.carModel).trim().slice(0, 160),
    sort: first(params.sort).trim().slice(0, 30) || 'newest',
    page: boundedPage(first(params.page)),
  }

  let initialData: PublicPartsList | null = null
  try { initialData = await getPublicPartsList(initialQuery) } catch { /* client retry remains available */ }

  return <Suspense fallback={<PartsFallback />}>
    <PartsView initialData={initialData} initialQuery={initialQuery} />
  </Suspense>
}
