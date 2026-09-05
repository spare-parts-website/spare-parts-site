import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('prioritizes primary navigation over high-cardinality home detail prefetches', () => {
  const home = readFileSync(new URL('../src/components/views/home-view.tsx', import.meta.url), 'utf8')

  assert.match(home, /unstable_cache/)
  assert.match(home, /\['home-marketplace-v1'\], \{ revalidate: 30 \}\)/)
  assert.match(home, /<Link prefetch=\{false\} href=\{`\/parts\/\$\{part\.id\}`\}/)
  assert.match(home, /<Link prefetch=\{false\} href=\{`\/stores\/\$\{store\.id\}`\}/)
  assert.match(home, /<Link href=\{href\}>عرض الكل/)
})
