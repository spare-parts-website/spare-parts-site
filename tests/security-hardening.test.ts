import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('CSP is request-scoped, nonce based, and reports violations safely', () => {
  const middleware = read('src/proxy.ts')
  const config = read('next.config.ts')
  const report = read('src/app/api/csp-report/route.ts')
  assert.match(middleware, /script-src 'self' 'nonce-/)
  assert.doesNotMatch(middleware, /script-src[^\n]*unsafe-inline/)
  assert.match(middleware, /x-request-id/)
  assert.match(middleware, /sec-fetch-site.*cross-site/)
  assert.match(middleware, /WEBHOOK_PATH/)
  assert.match(middleware, /report-to csp-endpoint/)
  assert.match(middleware, /sufrsfrrrzhhdluolxdf\.supabase\.co/)
  assert.doesNotMatch(middleware, /\*\.supabase\.co/)
  assert.match(config, /sufrsfrrrzhhdluolxdf\.supabase\.co/)
  assert.doesNotMatch(config, /\*\.supabase\.co/)
  assert.doesNotMatch(config, /Content-Security-Policy[\s\S]*unsafe-inline/)
  assert.match(report, /64 \* 1024/)
  assert.match(report, /csp\.violation/)
  assert.doesNotMatch(report, /console\.log\(body/)
})

test('JSON-LD scripts receive the middleware nonce instead of unsafe inline execution', () => {
  for (const path of ['src/app/[...route]/page.tsx', 'src/app/parts/[id]/page.tsx', 'src/app/stores/[id]/page.tsx']) {
    const source = read(path)
    assert.match(source, /headers\(\)/)
    assert.match(source, /<script nonce=\{nonce\}/)
    assert.match(source, /dynamic = 'force-dynamic'/)
  }
  assert.match(read('src/components/breadcrumbs.tsx'), /nonce\?: string/)
})

test('authenticated synthetic health reports dependency readiness without secrets', () => {
  const health = read('src/app/api/health/route.ts')
  assert.match(health, /configuredProviders/)
  assert.match(health, /healthyProviders/)
  assert.match(health, /supportRecipientConfigured/)
  assert.match(health, /paidPrimaryConfigured/)
  assert.doesNotMatch(health, /RESEND_API_KEY\s*[,}]/)
  assert.doesNotMatch(health, /OPENROUTER_API_KEY\s*[,}]/)
})

test('production start script supports both standalone and standard Next artifacts', () => {
  const start = read('scripts/start-production.cjs')
  assert.match(start, /standaloneServer/)
  assert.match(start, /nextCli/)
  assert.match(start, /spawn\(process\.execPath, \[nextCli, 'start', \.\.\.process\.argv\.slice\(2\)\]/)
})
