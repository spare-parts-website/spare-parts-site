import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('homepage render path stays database-free without exceeding Vercel Edge limits', () => {
  const page = read('src/app/page.tsx')
  const home = read('src/components/views/home-view.tsx')
  const api = read('src/app/api/home-marketplace/route.ts')

  assert.match(page, /runtime = 'nodejs'/)
  assert.doesNotMatch(page, /runtime = 'edge'/)
  assert.doesNotMatch(home, /@\/lib\/db/)
  assert.match(home, /HomeMarketplaceSections/)
  assert.match(api, /Vercel-CDN-Cache-Control/)
  assert.match(api, /stale-while-revalidate=300/)
})

test('public catalog caches shared facets and default lists', () => {
  const marketplace = read('src/lib/public-marketplace.ts')

  assert.match(marketplace, /loadPublicPartFacets = unstable_cache/)
  assert.match(marketplace, /public-part-facets-v1/)
  assert.match(marketplace, /public-parts-default-v1/)
  assert.match(marketplace, /public-stores-default-v1/)
  assert.match(marketplace, /revalidate: 300/)
})

test('Fluid Compute reuses one Prisma client per warm isolate', () => {
  const vercel = JSON.parse(read('vercel.json')) as { fluid?: boolean; regions?: string[] }
  const db = read('src/lib/db.ts')

  assert.equal(vercel.fluid, true)
  assert.deepEqual(vercel.regions, ['dub1'])
  assert.match(db, /globalForPrisma\.prisma = db/)
})

test('load hardening does not remove CSP nonce or mutation-origin protections', () => {
  const proxy = read('src/proxy.ts')

  assert.match(proxy, /script-src 'self' 'nonce-\$\{value\}'/)
  assert.match(proxy, /browserMutationAllowed/)
  assert.match(proxy, /sec-fetch-site/)
})

test('duplicate periodic route warmup is not mounted globally', () => {
  const layout = read('src/app/layout.tsx')
  assert.doesNotMatch(layout, /NavigationWarmup/)
})
