import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StoresView } from '@/components/views/stores-view'
import { getPublicStoresList, type PublicStoresList } from '@/lib/public-marketplace'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'المتاجر',
  description: 'تصفح متاجر قطع الغيار الموثوقة على غيار ماركت.',
  alternates: { canonical: 'https://ghyarmarket-eg.com/stores' },
}

function StoresFallback() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><p className="text-sm text-muted-foreground">جاري تحميل المتاجر...</p></div>
}

export default async function StoresPage() {
  let initialData: PublicStoresList | null = null
  try {
    initialData = await getPublicStoresList('', 1)
  } catch {
    // The static shell can still load its public API payload after hydration.
  }
  return <Suspense fallback={<StoresFallback />}>
    <StoresView initialData={initialData} initialSearch="" initialPage={1} />
  </Suspense>
}
