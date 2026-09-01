import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PartView } from '@/components/views/part-view'
import { db } from '@/lib/db'
import { getPublicPart } from '@/lib/public-marketplace'
import { schemaConditionUrl } from '@/lib/product-condition'

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
  const canonical = `https://ghyarmarket-eg.com/parts/${encodeURIComponent(id)}`
  try {
    const part = await db.part.findUnique({ where: { id }, select: { name: true, description: true, image: true } })
    if (part) return { title: part.name, description: part.description || `تعرف على سعر وتفاصيل ${part.name} واطلبه من غيار ماركت.`, openGraph: part.image ? { images: [part.image] } : undefined, alternates: { canonical } }
  } catch {
    // Keep metadata available if the database is temporarily unavailable.
  }
  return { title: 'قطعة غيار', alternates: { canonical } }
}

export default async function PartPage({ params }: Params) {
  const { id } = await params
  const { part, canReview } = await getPublicPart(id, null)
  if (!part) notFound()
  const breadcrumbItems = [{ label: 'الرئيسية', href: '/' }, { label: 'قطع الغيار', href: '/parts' }, { label: part.name }]
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: part.name,
    description: part.description || undefined,
    image: part.image ? [part.image] : undefined,
    brand: part.brand ? { '@type': 'Brand', name: part.brand } : undefined,
    itemCondition: schemaConditionUrl(part.condition),
    offers: { '@type': 'Offer', priceCurrency: 'EGP', price: part.price, availability: part.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: part.store.name } },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={breadcrumbItems} />
      <PartView partId={id} initialPart={part} initialCanReview={canReview} />
    </>
  )
}
