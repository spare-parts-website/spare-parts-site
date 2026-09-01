import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PartsView } from '@/components/views/parts-view'
import { getPublicPartsList, type PublicPartsList } from '@/lib/public-marketplace'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'قطع الغيار',
  description: 'تصفح قطع غيار السيارات المتاحة لدى متاجر غيار ماركت.',
  alternates: { canonical: 'https://ghyarmarket-eg.com/parts' },
}

function PartsFallback() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><p className="text-sm text-muted-foreground">جاري تحميل قطع الغيار...</p></div>
}

export default async function PartsPage() {
  let initialData: PublicPartsList | null = null
  try {
    initialData = await getPublicPartsList({ sort: 'newest', page: 1 })
  } catch {
    // The static shell can still load its public API payload after hydration.
  }
  return <Suspense fallback={<PartsFallback />}>
    <PartsView initialData={initialData} initialQuery={{ sort: 'newest', page: 1 }} />
  </Suspense>
}
