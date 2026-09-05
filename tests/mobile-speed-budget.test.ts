import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('keeps the critical shell off the legacy 748 KB logo PNG', () => {
  const files = [
    'src/app/layout.tsx',
    'src/components/header.tsx',
    'src/components/footer.tsx',
    'next.config.ts',
  ]

  for (const path of files) {
    const source = read(path)
    assert.doesNotMatch(source, /ghyar-market-logo\.png/, `${path} must not put the large PNG on the critical path`)
    assert.match(source, /ghyar-market-logo\.svg/, `${path} should use the lightweight SVG`)
  }

  const svgBytes = statSync(new URL('public/ghyar-market-logo.svg', root)).size
  assert.ok(svgBytes < 10_000, `critical logo should stay tiny; got ${svgBytes} bytes`)
})

test('defers background work until after initial loading', () => {
  const warmup = read('src/components/navigation-warmup.tsx')
  const pwa = read('src/components/pwa-installer.tsx')
  const header = read('src/components/header.tsx')
  const mobileNav = read('src/components/mobile-bottom-nav.tsx')

  assert.match(warmup, /document\.readyState === 'complete'/)
  assert.match(warmup, /requestIdleCallback/)
  assert.match(pwa, /requestIdleCallback/)
  assert.doesNotMatch(header, /routes\.forEach\(\(path\) => router\.prefetch\(path\)\)/)
  assert.doesNotMatch(mobileNav, /backdrop-blur/)
})
