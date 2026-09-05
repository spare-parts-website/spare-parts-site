import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('keeps high-frequency top-level routes warm in the client router cache', () => {
  const warmup = readFileSync(new URL('../src/components/navigation-warmup.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')

  for (const route of ['/', '/parts', '/stores', '/support']) {
    assert.match(warmup, new RegExp(route.replace('/', '\\/')))
  }
  assert.match(warmup, /router\.prefetch\(href, \{ onInvalidate: refresh \}\)/)
  assert.match(layout, /<NavigationWarmup \/>/)
  assert.match(layout, /export const dynamic = 'force-dynamic'/)
  assert.match(config, /staleTimes:\s*\{[\s\S]*dynamic:\s*300[\s\S]*static:\s*300/)
})

test('runs Vercel functions next to the eu-west-1 Supabase database', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.regions, ['dub1'])
  assert.deepEqual(config.functionFailoverRegions, ['fra1'])
})
