import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { StoreView } from '@/components/views/store-view'
import { getAnonymousPublicStore } from '@/lib/public-marketplace'

type Params = { params: Promise<{ id: string }> }

export const revalidate = 30
export const dynamicParams = true
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const canonical = `https://ghyarmarket-eg.com/stores/${encodeURIComponent(id)}`
  try {
    const { store } = await getAnonymousPublicStore(id)
    if (store) return { title: store.name, description: store.description || `تصفح قطع الغيار المتاحة لدى ${store.name}.`, openGraph: store.image ? { images: [store.image] } : undefined, alternates: { canonical } }
  } catch {
    // Keep metadata available if the database is temporarily unavailable.
  }
  return { title: 'متجر قطع غيار', alternates: { canonical } }
}

export default async function StorePage({ params }: Params) {
  const nonce = (await headers()).get('x-nonce') || undefined
  const { id } = await params
  const { store, canReview } = await getAnonymousPublicStore(id)
  if (!store) notFound()
  const breadcrumbItems = [{ label: 'الرئيسية', href: '/' }, { label: 'المتاجر', href: '/stores' }, { label: store.name }]
  const structuredData = { '@context': 'https://schema.org', '@type': 'AutoPartsStore', name: store.name, description: store.description || undefined, image: store.image || undefined, address: store.address || undefined, telephone: store.phone || undefined, url: `https://ghyarmarket-eg.com/stores/${id}` }
  return (
    <>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={breadcrumbItems} nonce={nonce} />
      <StoreView storeId={id} initialStore={store} initialCanReview={canReview} />
    </>
  )
}
