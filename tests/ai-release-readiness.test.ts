import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../src/components/ai-assistant.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
const agent = readFileSync(new URL('../src/lib/ai/agent.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../src/lib/ai/runtime.ts', import.meta.url), 'utf8')

test('ships the AI assistant without beta or provider-specific user-facing branding', () => {
  assert.equal(/\bBeta\b/i.test(assistant), false)
  assert.equal(/Gemini/.test(assistant), false)
  assert.equal(/Gemini/.test(route), false)
  assert.equal(assistant.includes('الخدمة الأولى مشغولة'), false)
  assert.equal(assistant.includes('خدمة مجانية أخرى'), false)
  assert.match(assistant, /role="status" aria-live="polite"/)
})

test('bounds server provider fallback work below the existing client timeout', () => {
  assert.match(route, /AI_PROVIDER_BUDGET_MS = 44_000/)
  assert.match(route, /AI_MIN_PROVIDER_ATTEMPT_MS = 2_500/)
  assert.match(route, /Math\.min\(attemptTimeout\(plan\.complexity, hasImage, provider\), remainingBudget\)/)
  assert.match(route, /request_budget_exhausted/)
  assert.match(assistant, /requestAgeSeconds < 50/)
  assert.ok(44_000 < 50_000)
})

test('keeps authenticated model traffic on privacy-constrained provider routes', () => {
  assert.match(route, /privateContext: Boolean\(user\)/)
  assert.match(runtime, /process\.env\.GEMINI_API_KEY && !options\?\.privateContext/)
  assert.match(runtime, /if \(!options\?\.privateContext\) targets\.push\('openrouter-text-pool-b'\)/)
  assert.match(agent, /zeroDataRetention: true/)
  assert.match(agent, /data_collection: 'deny'/)
  assert.match(agent, /zdr: true/)
  assert.match(agent, /providerUserId/)
  assert.equal(/user: input\.user\?\.id/.test(agent), false)
})
