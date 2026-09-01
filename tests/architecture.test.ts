import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('server-renders bounded homepage marketplace data without exposing owner identity', () => {
  const home = readFileSync(new URL('../src/components/views/home-view.tsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(home, /^['"]use client['"]/)
  assert.match(home, /db\.part\.findMany/)
  assert.match(home, /db\.store\.findMany/)
  assert.match(home, /take: 16/)
  assert.match(home, /take: 12/)
  assert.doesNotMatch(home, /fetch\(['"]\/api\/(?:parts|stores)/)
  assert.doesNotMatch(home, /owner:\s*\{\s*select/)
  assert.match(home, /action="\/parts" method="get"/)
  assert.match(page, /<HomeView isSeller=/)
  assert.doesNotMatch(layout, /متاجر موثوقة/)
})

test('server-renders product and store details through privacy-safe public loaders', () => {
  const routes = readFileSync(new URL('../src/app/[...route]/page.tsx', import.meta.url), 'utf8')
  const publicData = readFileSync(new URL('../src/lib/public-marketplace.ts', import.meta.url), 'utf8')
  const partView = readFileSync(new URL('../src/components/views/part-view.tsx', import.meta.url), 'utf8')
  const storeView = readFileSync(new URL('../src/components/views/store-view.tsx', import.meta.url), 'utf8')

  assert.match(routes, /initialPart=\{part\}/)
  assert.match(routes, /initialStore=\{store\}/)
  assert.match(routes, /if \(!part\) notFound\(\)/)
  assert.match(routes, /if \(!store\) notFound\(\)/)
  assert.match(publicData, /isOwnedByViewer:/)
  assert.match(publicData, /items: \{ some: \{ partId \} \}/)
  assert.doesNotMatch(partView, /part\.store\.owner/)
  assert.doesNotMatch(storeView, /store\.owner/)
  assert.doesNotMatch(storeView, /quality=\{100\}/)
  assert.match(storeView, /store\.verified &&/)
})

test('server-renders bounded marketplace lists without seller profile data', () => {
  const routes = readFileSync(new URL('../src/app/[...route]/page.tsx', import.meta.url), 'utf8')
  const publicData = readFileSync(new URL('../src/lib/public-marketplace.ts', import.meta.url), 'utf8')
  const partsApi = readFileSync(new URL('../src/app/api/parts/route.ts', import.meta.url), 'utf8')
  const storesApi = readFileSync(new URL('../src/app/api/stores/route.ts', import.meta.url), 'utf8')
  const partsView = readFileSync(new URL('../src/components/views/parts-view.tsx', import.meta.url), 'utf8')
  const storesView = readFileSync(new URL('../src/components/views/stores-view.tsx', import.meta.url), 'utf8')

  assert.match(routes, /getPublicPartsList\(initialQuery, user\)/)
  assert.match(routes, /<PartsView initialData=\{initialData\}/)
  assert.match(routes, /getPublicStoresList\(search, initialPage\)/)
  assert.match(routes, /<StoresView initialData=\{initialData\}/)
  assert.match(publicData, /const pageSize = 24/)
  assert.match(publicData, /const pageSize = 18/)
  assert.match(publicData, /take: pageSize/)
  assert.match(publicData, /completionRate: decided \?/)
  assert.match(partsApi, /getPublicPartsList/)
  assert.match(storesApi, /getPublicStoresList/)
  assert.doesNotMatch(partsView, /part\.store\.owner/)
  assert.doesNotMatch(storesView, /store\.owner/)
  assert.doesNotMatch(partsView, /quality=\{100\}/)
  assert.doesNotMatch(storesView, /quality=\{100\}/)
  assert.doesNotMatch(storesView, /completionRate \?\? 100/)
})

test('expands structured fitment additively and warns before checkout', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../prisma/structured-fitment.sql', import.meta.url), 'utf8')
  const publicData = readFileSync(new URL('../src/lib/public-marketplace.ts', import.meta.url), 'utf8')
  const checkout = readFileSync(new URL('../src/components/views/checkout-view.tsx', import.meta.url), 'utf8')

  assert.match(schema, /universal\s+Boolean\s+@default\(false\)/)
  assert.match(schema, /generation\s+String\?/)
  assert.match(schema, /trim\s+String\?/)
  assert.match(migration, /add column if not exists "universal"/)
  assert.doesNotMatch(migration, /\b(?:drop|truncate|delete)\b/i)
  assert.match(publicData, /evaluateFitment/)
  assert.match(publicData, /universal: true/)
  assert.match(checkout, /راجع توافق القطع قبل تأكيد الطلب/)
})

test('keeps typo-tolerant marketplace search indexed and bounded', () => {
  const migration = readFileSync(new URL('../prisma/search-tolerance.sql', import.meta.url), 'utf8')
  const search = readFileSync(new URL('../src/lib/marketplace-search.ts', import.meta.url), 'utf8')

  assert.match(migration, /VehicleCompatibility_search_trgm_idx/)
  assert.match(migration, /Store_search_trgm_idx/)
  assert.doesNotMatch(migration, /\b(?:drop|truncate|delete)\b/i)
  assert.match(search, /operator\(extensions\.%>\)/)
  assert.match(search, /Math\.min\(Math\.max\(limit, 1\), 500\)/)
})
