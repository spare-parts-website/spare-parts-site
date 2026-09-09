import { applicationOrigin } from '@/lib/application-url'
import { sitemapBoundaries } from '@/lib/sitemap-data'
import { sitemapXml } from '@/lib/sitemap-xml'

export const dynamic = 'force-dynamic'
export async function GET() {
  const origin = applicationOrigin()
  try {
    const boundaries = await sitemapBoundaries()
    const entries = [{ url: new URL('/sitemaps/static.xml', origin).toString() }, ...boundaries.map(row => {
      const url = new URL('/sitemaps/' + row.kind + '.xml', origin)
      url.searchParams.set('start', row.start)
      if (row.end) url.searchParams.set('end', row.end)
      return { url: url.toString() }
    })]
    return new Response(sitemapXml(entries, true), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } })
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } })
  }
}
