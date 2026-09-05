import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('hot anonymous pages can prerender instead of paying SSR cost per request', () => {
  const layout = read('src/app/layout.tsx')
  const page = read('src/app/page.tsx')
  const config = read('next.config.ts')

  assert.doesNotMatch(layout, /export const dynamic = 'force-dynamic'/)
  assert.doesNotMatch(page, /export const dynamic = 'force-dynamic'/)
  assert.match(config, /sri:\s*\{[\s\S]*algorithm: 'sha256'/)
  assert.match(config, /source: '\/'/)
  assert.match(config, /source: '\/parts'/)
  assert.match(config, /source: '\/stores'/)
  assert.match(config, /script-src 'self'/)
  assert.doesNotMatch(config, /script-src 'self' 'unsafe-inline'/)
})

test('strict CSP stays nonce-based on dynamic pages while cacheable JSON avoids nonce work', () => {
  const proxy = read('src/proxy.ts')

  assert.match(proxy, /script-src 'self' 'nonce-\$\{value\}'/)
  assert.match(proxy, /pathname\.startsWith\('\/api\/'\)/)
  assert.match(proxy, /browserMutationAllowed\(request\)/)
  assert.match(proxy, /STATIC_PUBLIC_PATHS/)
  assert.match(proxy, /api\/home-marketplace\$/)
  assert.match(proxy, /next-router-prefetch/)
  assert.match(proxy, /purpose.*prefetch/)
})

test('theme bootstrap is external so static CSP does not need inline script exceptions', () => {
  const layout = read('src/app/layout.tsx')
  const theme = read('public/theme-init.js')
  const toggle = read('src/components/theme-toggle.tsx')

  assert.doesNotMatch(layout, /ThemeProvider/)
  assert.match(layout, /src="\/theme-init\.js"/)
  assert.match(theme, /localStorage\.getItem\('theme'\)/)
  assert.match(theme, /classList\.toggle\('dark'/)
  assert.doesNotMatch(toggle, /next-themes/)
})

test('homepage defers below-fold marketplace work and spreads the client request burst', () => {
  const home = read('src/components/views/home-view.tsx')
  const loader = read('src/components/home-marketplace-sections-loader.tsx')
  const data = read('src/app/api/home-marketplace/route.ts')

  assert.match(home, /HomeMarketplaceSectionsLoader/)
  assert.match(loader, /dynamic\(/)
  assert.match(loader, /ssr: false/)
  assert.match(loader, /Math\.random\(\)/)
  assert.match(loader, /setTimeout/)
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
