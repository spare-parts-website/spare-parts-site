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
