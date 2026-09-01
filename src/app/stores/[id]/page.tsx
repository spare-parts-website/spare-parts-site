import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { StoreView } from '@/components/views/store-view'
import { db } from '@/lib/db'
import { getPublicStore } from '@/lib/public-marketplace'

type Params = { params: Promise<{ id: string }> }

export const revalidate = 30
export const dynamicParams = true

// Empty at build time keeps inventory out of the build artifact while allowing
// each public detail URL to be rendered and revalidated on first request.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const canonical = `https://ghyarmarket-eg.com/stores/${encodeURIComponent(id)}`
  try {
    const store = await db.store.findUnique({ where: { id }, select: { name: true, description: true, image: true } })
    if (store) return { title: store.name, description: store.description || `تصفح قطع الغيار المتاحة لدى ${store.name}.`, openGraph: store.image ? { images: [store.image] } : undefined, alternates: { canonical } }
  } catch {
    // Keep metadata available if the database is temporarily unavailable.
  }
  return { title: 'متجر قطع غيار', alternates: { canonical } }
}

export default async function StorePage({ params }: Params) {
  const { id } = await params
  const { store, canReview } = await getPublicStore(id, null)
  if (!store) notFound()
  const breadcrumbItems = [{ label: 'الرئيسية', href: '/' }, { label: 'المتاجر', href: '/stores' }, { label: store.name }]
  const structuredData = { '@context': 'https://schema.org', '@type': 'AutoPartsStore', name: store.name, description: store.description || undefined, image: store.image || undefined, address: store.address || undefined, telephone: store.phone || undefined, url: `https://ghyarmarket-eg.com/stores/${id}` }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={breadcrumbItems} />
      <StoreView storeId={id} initialStore={store} initialCanReview={canReview} />
    </>
  )
}
