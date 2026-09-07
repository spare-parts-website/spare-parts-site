import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('keeps top-level navigation intent-prefetched without speculative route bursts', () => {
  const header = readFileSync(new URL('../src/components/header.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
  const homePage = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8')
  const partsPage = readFileSync(new URL('../src/app/parts/page.tsx', import.meta.url), 'utf8')
  const storesPage = readFileSync(new URL('../src/app/stores/page.tsx', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')

  assert.match(header, /const intentPrefetch = \(path: string\) => \(\{/)
  assert.match(header, /prefetch: false as const/)
  assert.match(header, /onMouseEnter: \(\) => router\.prefetch\(path\)/)
  assert.match(header, /onFocus: \(\) => router\.prefetch\(path\)/)
  assert.match(header, /onTouchStart: \(\) => router\.prefetch\(path\)/)
  assert.match(header, /<Link href="\/support" prefetch=\{false\}/)
  assert.match(header, /<Link href="\/seller\/parts" prefetch=\{false\}/)
  assert.match(header, /<Link href="\/admin\/users" prefetch=\{false\}/)
  assert.doesNotMatch(header, /const routes = \[/)
  assert.doesNotMatch(header, /routes\.forEach\(.*router\.prefetch/)
  assert.doesNotMatch(layout, /NavigationWarmup/)
  assert.doesNotMatch(layout, /export const dynamic = 'force-dynamic'/)
  assert.match(homePage, /await connection\(\)/)
  assert.match(partsPage, /await connection\(\)/)
  assert.match(storesPage, /await connection\(\)/)
  assert.match(config, /sri:\s*\{\s*algorithm: 'sha256'/)
  assert.match(config, /staleTimes:\s*\{[\s\S]*dynamic:\s*300[\s\S]*static:\s*300/)
})

test('runs Vercel functions next to the eu-west-1 Supabase database with one Hobby-compatible region', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.regions, ['dub1'])
  assert.equal(config.functionFailoverRegions, undefined)
})
