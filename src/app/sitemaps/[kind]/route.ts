import { applicationOrigin } from '@/lib/application-url'
import { db } from '@/lib/db'
import { sitemapXml } from '@/lib/sitemap-xml'

const MAX_ENTRIES = 50_000

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  const origin = applicationOrigin()
  const xmlResponse = (entries: Array<{ url: string; updatedAt?: Date }>) => new Response(sitemapXml(entries), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } })
  if (kind === 'static.xml') return xmlResponse(['/', '/parts', '/stores', '/privacy', '/terms', '/returns', '/contact'].map(path => ({ url: new URL(path, origin).toString() })))
  if (kind !== 'parts.xml' && kind !== 'stores.xml') return new Response(null, { status: 404 })
  const query = new URL(request.url).searchParams
  const start = query.get('start') || ''
  const end = query.get('end')
  const valid = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value)
  if (!valid(start) || (end !== null && (!valid(end) || end <= start))) return new Response(null, { status: 400 })
  const id = { gte: start, ...(end ? { lt: end } : {}) }
  try {
    const entries = kind === 'parts.xml'
      ? await db.part.findMany({ where: { id, moderationStatus: 'ACTIVE', store: { moderationStatus: 'ACTIVE' } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' }, take: MAX_ENTRIES + 1 })
      : await db.store.findMany({ where: { id, moderationStatus: 'ACTIVE', parts: { some: { moderationStatus: 'ACTIVE' } } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' }, take: MAX_ENTRIES + 1 })
    // Inserts can grow a cached range. Fail visibly rather than truncate URLs.
    if (entries.length > MAX_ENTRIES) return new Response('Sitemap boundaries are refreshing', { status: 503, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } })
    const section = kind === 'parts.xml' ? 'parts' : 'stores'
    return xmlResponse(entries.map(entry => ({ url: new URL('/' + section + '/' + encodeURIComponent(entry.id), origin).toString(), updatedAt: entry.updatedAt })))
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } })
  }
}
