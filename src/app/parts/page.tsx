import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { PartsView } from '@/components/views/parts-view'
import { getPublicPartsList, type PublicPartsList } from '@/lib/public-marketplace'

export const metadata: Metadata = {
  title: 'قطع الغيار',
  description: 'تصفح قطع غيار السيارات المتاحة لدى متاجر غيار ماركت.',
  alternates: { canonical: 'https://ghyarmarket-eg.com/parts' },
}

function PartsFallback() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><p className="text-sm text-muted-foreground">جاري تحميل قطع الغيار...</p></div>
}

export default async function PartsPage() {
  // This HTML must be request-rendered so Proxy can provide a nonce for Next's
  // inline App Router scripts. The default marketplace query itself remains
  // cached for 30 seconds in getPublicPartsList().
  await connection()

  let initialData: PublicPartsList | null = null
  try {
    initialData = await getPublicPartsList({ sort: 'newest', page: 1 })
  } catch {
    // The shell can still load its public API payload after hydration.
  }
  return <Suspense fallback={<PartsFallback />}>
    <PartsView initialData={initialData} initialQuery={{ sort: 'newest', page: 1 }} />
  </Suspense>
}
