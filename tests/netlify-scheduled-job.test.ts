import test from 'node:test'
import assert from 'node:assert/strict'
import { runScheduledJob } from '../netlify/functions/_shared/scheduled-job.ts'

const base = { JOBS_ENABLED: '1', APP_URL: 'https://example.test', CRON_SECRET: 'test-only' }
const env = (values: Record<string, string>) => (name: string) => values[name]
const options = { path: '/api/jobs/email' as const, timeoutMs: 20_000 }

test('Netlify jobs remain disabled without explicit activation', async () => {
  const response = await runScheduledJob({ ...options, env: env({}), request: async () => { throw new Error('must not call') } })
  assert.equal(response.status, 204)
})

test('Netlify jobs reject invalid origins before sending credentials', async () => {
  for (const origin of ['broken', 'http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?redirect=x']) {
    let called = false
    const response = await runScheduledJob({ ...options, env: env({ ...base, APP_URL: origin }), request: async () => { called = true; return new Response() } })
    assert.equal(response.status, 503)
    assert.equal(called, false)
  }
})

test('Netlify retries use bounded authenticated requests without redirects', async () => {
  const response = await runScheduledJob({ ...options, env: env(base), request: async (url, init) => {
    assert.equal(String(url), 'https://example.test/api/jobs/email')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-only')
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    return new Response(null, { status: 204 })
  } })
  assert.equal(response.status, 204)
})

test('Netlify job failures do not disclose upstream bodies or exceptions', async () => {
  for (const request of [async () => new Response('private data', { status: 500 }), async () => { throw new Error('secret detail') }]) {
    const response = await runScheduledJob({ ...options, env: env(base), request })
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /private data|secret detail/)
  }
})
