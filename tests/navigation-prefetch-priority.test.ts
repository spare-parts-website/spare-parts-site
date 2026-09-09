import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('prioritizes primary navigation over high-cardinality home detail prefetches', () => {
  const homeData = readFileSync(new URL('../src/lib/home-marketplace-data.ts', import.meta.url), 'utf8')
  const sections = readFileSync(new URL('../src/components/home-marketplace-sections.tsx', import.meta.url), 'utf8')

  assert.match(homeData, /unstable_cache/)
  assert.match(homeData, /\['home-marketplace-v3'\], \{ revalidate: 120 \}\)/)
  assert.match(sections, /<Link prefetch=\{false\} href=\{`\/parts\/\$\{part\.id\}`\}/)
  assert.match(sections, /<Link prefetch=\{false\} href=\{`\/stores\/\$\{store\.id\}`\}/)
  assert.match(sections, /<Link href=\{href\}>عرض الكل/)
})
