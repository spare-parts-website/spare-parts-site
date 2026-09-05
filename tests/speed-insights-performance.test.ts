import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('keeps critical paint assets off the request middleware path', () => {
  const proxy = read('src/proxy.ts')
  for (const asset of ['ghyar-market-hero.webp', 'ghyar-market-logo.png', 'sw.js', 'manifest.webmanifest']) {
    assert.match(proxy, new RegExp(asset.replace('.', '\\.')))
  }
  assert.match(proxy, /script-src 'self' 'nonce-\$\{value\}'/)
})

test('caches the anonymous marketplace landing payloads despite the dynamic CSP shell', () => {
  const cache = read('src/lib/public-marketplace-cache.ts')
  const parts = read('src/app/parts/page.tsx')
  const stores = read('src/app/stores/page.tsx')
  assert.match(cache, /unstable_cache/)
  assert.match(cache, /public-parts-landing-v1/)
  assert.match(cache, /public-stores-landing-v1/)
  assert.match(cache, /revalidate: 30/)
  assert.match(parts, /getCachedPublicPartsLanding\(\)/)
  assert.match(stores, /getCachedPublicStoresLanding\(\)/)
})

test('prioritizes first paint over noncritical global shell work', () => {
  const warmup = read('src/components/navigation-warmup.tsx')
  const header = read('src/components/header.tsx')
  const shell = read('src/components/app-shell.tsx')
  const pwa = read('src/components/pwa-installer.tsx')

  assert.match(warmup, /const CORE_ROUTES = \['\/', '\/parts', '\/stores', '\/support'\]/)
  assert.match(warmup, /requestIdleCallback/)
  assert.doesNotMatch(header, /routes\.forEach\(\(path\) => router\.prefetch\(path\)\)/)
  assert.match(header, /import Image from 'next\/image'/)
  assert.match(header, /width=\{72\}/)
  assert.match(shell, /const LazyCartDrawer = dynamic/)
  assert.match(shell, /cartOpen \? <LazyCartDrawer \/>/)
  assert.match(shell, /requestIdleCallback/)
  assert.match(pwa, /document\.readyState === 'complete'/)
  assert.match(pwa, /requestIdleCallback/)
})

test('splits common catch-all pages into dedicated route entrypoints', () => {
  for (const path of [
    'src/app/support/page.tsx',
    'src/app/login/page.tsx',
    'src/app/register/page.tsx',
    'src/app/forgot-password/page.tsx',
    'src/app/reset-password/page.tsx',
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path)
  }
})
