import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

// Keep the mobile critical-path improvements from regressing as the marketplace evolves.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('keeps critical paint assets off the request middleware path', () => {
  const proxy = read('src/proxy.ts')
  for (const asset of ['ghyar-market-hero.webp', 'ghyar-market-logo.png', 'ghyar-market-icon.png', 'sw.js', 'manifest.webmanifest']) {
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
  const layout = read('src/app/layout.tsx')
  const mobilePaint = read('src/app/mobile-performance.css')
  const mobileNav = read('src/components/mobile-bottom-nav.tsx')
  const avatar = read('src/components/user-avatar.tsx')
  const config = read('next.config.ts')

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
  assert.match(layout, /import "\.\/mobile-performance\.css"/)
  assert.match(mobilePaint, /background-attachment: scroll/)
  assert.match(mobilePaint, /backdrop-filter: none !important/)
  assert.match(mobilePaint, /content-visibility: auto/)
  assert.doesNotMatch(mobileNav, /backdrop-blur/)
  assert.match(avatar, /loading="lazy"/)
  assert.match(avatar, /decoding="async"/)
  assert.match(config, /source: '\/ghyar-market-logo\.png'/)
  assert.match(config, /source: '\/ghyar-market-hero\.webp'/)
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
