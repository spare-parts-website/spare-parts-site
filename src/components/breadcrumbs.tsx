import Link from 'next/link'

export type BreadcrumbItem = { label: string; href?: string }

export function Breadcrumbs({ items, nonce }: { items: BreadcrumbItem[]; nonce?: string }) {
  if (items.length < 2) return null
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: item.href } : {}),
    })),
  }
  return (
    <>
      <nav aria-label="مسار التنقل" className="content-container mb-4 pt-5 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.href && index < items.length - 1 ? <Link href={item.href} className="transition hover:text-primary">{item.label}</Link> : <span aria-current="page" className="font-medium text-foreground">{item.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  )
}
