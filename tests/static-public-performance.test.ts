import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('hot anonymous HTML keeps nonce hydration safety while marketplace data stays cached', () => {
  const layout = read('src/app/layout.tsx')
  const homePage = read('src/app/page.tsx')
  const partsPage = read('src/app/parts/page.tsx')
  const storesPage = read('src/app/stores/page.tsx')
  const publicMarketplace = read('src/lib/public-marketplace.ts')
  const homeApi = read('src/app/api/home-marketplace/route.ts')

  assert.doesNotMatch(layout, /export const dynamic = 'force-dynamic'/)
  assert.match(homePage, /await connection\(\)/)
  assert.match(partsPage, /await connection\(\)/)
  assert.match(storesPage, /await connection\(\)/)

  assert.match(publicMarketplace, /loadDefaultPublicPartsList = unstable_cache\([\s\S]*?\['public-parts-default-v3'\],[\s\S]*?\{ revalidate: 30 \}/)
  assert.match(publicMarketplace, /loadDefaultPublicStoresList = unstable_cache\([\s\S]*?\['public-stores-default-v3'\],[\s\S]*?\{ revalidate: 30 \}/)
  assert.match(homeApi, /s-maxage=120/)
  assert.match(homeApi, /stale-while-revalidate=300/)
})

test('strict CSP stays nonce-based on HTML while cacheable JSON avoids nonce work', () => {
  const proxy = read('src/proxy.ts')

  assert.match(proxy, /script-src 'self' 'nonce-\$\{value\}'/)
  assert.match(proxy, /pathname\.startsWith\('\/api\/'\)/)
  assert.match(proxy, /browserMutationAllowed\(request\)/)
  assert.doesNotMatch(proxy, /STATIC_PUBLIC_PATHS/)
  assert.match(proxy, /api\/home-marketplace\$/)
  assert.match(proxy, /next-router-prefetch/)
  assert.match(proxy, /purpose.*prefetch/)
  assert.doesNotMatch(proxy, /script-src[^\n]*unsafe-inline/)
})

test('theme bootstrap is external so nonce CSP does not need custom inline theme code', () => {
  const layout = read('src/app/layout.tsx')
  const theme = read('public/theme-init.js')
  const toggle = read('src/components/theme-toggle.tsx')

  assert.doesNotMatch(layout, /ThemeProvider/)
  assert.match(layout, /src="\/theme-init\.js"/)
  assert.match(theme, /localStorage\.getItem\('theme'\)/)
  assert.match(theme, /classList\.toggle\('dark'/)
  assert.doesNotMatch(toggle, /next-themes/)
})

test('homepage defers below-fold marketplace work without randomized request timing', () => {
  const home = read('src/components/views/home-view.tsx')
  const loader = read('src/components/home-marketplace-sections-loader.tsx')
  const data = read('src/app/api/home-marketplace/route.ts')

  assert.match(home, /HomeMarketplaceSectionsLoader/)
  assert.match(loader, /dynamic\(/)
  assert.match(loader, /ssr: false/)
  assert.match(loader, /IntersectionObserver/)
  assert.match(loader, /requestIdleCallback/)
  assert.match(loader, /setTimeout/)
  assert.doesNotMatch(loader, /Math\.random\(\)/)
  assert.match(data, /s-maxage=120/)
  assert.match(data, /stale-while-revalidate=300/)
})

test('realistic k6 load scenario ramps to 800 VUs with think time and production guard', () => {
  const load = read('tests/load/k6-public-marketplace.js')

  for (const target of [1, 25, 50, 100, 200, 400, 800]) {
    assert.match(load, new RegExp(`target:\\s*${target}\\b`))
  }
  assert.match(load, /sleep\(/)
  assert.match(load, /ALLOW_PRODUCTION_LOAD/)
  assert.match(load, /\/api\/home-marketplace/)
  assert.match(load, /\/api\/parts/)
  assert.match(load, /\/parts/)
  assert.match(load, /search=/)
})
