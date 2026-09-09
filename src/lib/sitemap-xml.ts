export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!)
}
export function sitemapXml(entries: Array<{ url: string; updatedAt?: Date }>, index = false): string {
  const root = index ? 'sitemapindex' : 'urlset'
  const item = index ? 'sitemap' : 'url'
  return `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    entries.map(entry => `<${item}><loc>${escapeXml(entry.url)}</loc>${entry.updatedAt ? '<lastmod>' + entry.updatedAt.toISOString() + '</lastmod>' : ''}</${item}>`).join('') +
    `</${root}>`
}
