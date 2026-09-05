import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('keeps high-frequency top-level routes warm without periodic duplicate traffic', () => {
  const header = readFileSync(new URL('../src/components/header.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')

  assert.match(header, /const routes = \['\/', '\/parts', '\/stores', '\/support'\]/)
  assert.match(header, /routes\.forEach\(\(path\) => router\.prefetch\(path\)\)/)
  assert.doesNotMatch(layout, /NavigationWarmup/)
  assert.doesNotMatch(layout, /export const dynamic = 'force-dynamic'/)
  assert.match(config, /sri:\s*\{\s*algorithm: 'sha256'/)
  assert.match(config, /staleTimes:\s*\{[\s\S]*dynamic:\s*300[\s\S]*static:\s*300/)
})

test('runs Vercel functions next to the eu-west-1 Supabase database with one Hobby-compatible region', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.regions, ['dub1'])
  assert.equal(config.functionFailoverRegions, undefined)
})
