import test from 'node:test'
import assert from 'node:assert/strict'
import { sitemapXml } from '../src/lib/sitemap-xml.ts'

test('sitemaps safely encode query parameters and preserve lastModified', () => {
  const result = sitemapXml([{ url: 'https://example.com/a?start=x&end=y', updatedAt: new Date('2026-01-01') }])
  assert.ok(result.includes('start=x&amp;end=y'))
  assert.ok(result.includes('<lastmod>2026-01-01T00:00:00.000Z</lastmod>'))
  assert.ok(result.includes('<urlset '))
})
test('index contains sitemap entries rather than product URL entries', () => {
  const result = sitemapXml([{ url: 'https://example.com/sitemaps/parts.xml' }], true)
  assert.ok(result.includes('<sitemapindex '))
  assert.ok(result.includes('<sitemap><loc>'))
})
