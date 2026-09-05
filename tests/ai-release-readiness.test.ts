import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../src/components/ai-assistant.tsx', import.meta.url), 'utf8')
const assistantLoader = readFileSync(new URL('../src/components/ai-assistant-loader.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
const agent = readFileSync(new URL('../src/lib/ai/agent.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../src/lib/ai/runtime.ts', import.meta.url), 'utf8')

test('ships the AI assistant without beta or provider-specific user-facing branding', () => {
  assert.equal(/\bBeta\b/i.test(assistant), false)
  assert.equal(/\bBeta\b/i.test(assistantLoader), false)
  assert.equal(/Gemini/.test(assistant), false)
  assert.equal(/Gemini/.test(route), false)
  assert.equal(assistant.includes('الخدمة الأولى مشغولة'), false)
  assert.equal(assistant.includes('خدمة مجانية أخرى'), false)
  assert.match(assistant, /role="status" aria-live="polite"/)
})

test('clears the composer before waiting for the AI response', () => {
  const prepare = assistant.indexOf('const files = await Promise.all')
  const clearInput = assistant.indexOf("setInput('')", prepare)
  const clearAttachments = assistant.indexOf('clearAttachmentState()', prepare)
  const stopUploading = assistant.indexOf('setUploading(false)', prepare)
  const send = assistant.indexOf('await sendMessage', prepare)
  assert.ok(prepare >= 0)
  assert.ok(prepare < clearInput && clearInput < send)
  assert.ok(prepare < clearAttachments && clearAttachments < send)
  assert.ok(prepare < stopUploading && stopUploading < send)
})

test('bounds server provider fallback work below the existing client timeout', () => {
  assert.match(route, /AI_PROVIDER_BUDGET_MS = 44_000/)
  assert.match(route, /AI_MIN_PROVIDER_ATTEMPT_MS = 2_500/)
  assert.match(route, /Math\.min\(attemptTimeout\(plan\.complexity, hasImage, provider\), remainingBudget\)/)
  assert.match(route, /request_budget_exhausted/)
  assert.match(assistant, /requestAgeSeconds < 50/)
  assert.ok(44_000 < 50_000)
})

test('public free fallback routing is explicit, small, and cannot silently become paid', () => {
  assert.match(runtime, /targets\.push\('gateway-minimax-free'\)/)
  assert.match(runtime, /targets\.push\('openrouter-glm-free'\)/)
  assert.match(runtime, /targets\.push\('openrouter-gemma-free'\)/)
  assert.match(agent, /gateway\('minimax\/minimax-m3'\)/)
  assert.match(agent, /only: \['gmicloud'\]/)
  assert.match(agent, /if \(provider === 'openrouter-glm-free'\).*z-ai\/glm-5\.2:free/)
  assert.match(agent, /if \(provider === 'openrouter-gemma-free'\).*google\/gemma-4-31b-it:free/)
  assert.equal(/return createOpenRouter\(\{ apiKey \}\)\('openrouter\/free'\)/.test(agent), false)
  assert.equal(/targets\.push\('openrouter'\)/.test(runtime), false)
})

test('private routing fails closed before public free fallbacks', () => {
  assert.match(route, /privateContext: Boolean\(user\)/)
  assert.match(runtime, /if \(process\.env\.GEMINI_API_KEY\) targets\.push\('google'\)/)
  const privateReturn = runtime.indexOf('if (privateContext) return targets')
  const freeGateway = runtime.indexOf("targets.push('gateway-minimax-free')")
  assert.ok(privateReturn >= 0 && freeGateway > privateReturn)
  assert.equal(/privateContext[\s\S]{0,300}targets\.push\('openrouter'\)/.test(runtime), false)
  assert.match(agent, /data_collection: 'deny'/)
})

test('never forwards a raw internal user id to model providers', () => {
  assert.match(agent, /providerUserId/)
  assert.match(agent, /ghyar_\$\{createHash\('sha256'\)/)
  assert.equal(/user:\s*input\.user\?\.id/.test(agent), false)
  assert.equal(/user:\s*input\.user\.id/.test(agent), false)
})

test('429 and unavailable providers fail over instead of becoming user-visible provider errors', () => {
  assert.match(route, /429\|rate\.\?limit\|resource\.\?exhausted/)
  assert.match(route, /return 'rate_limited'/)
  assert.match(route, /recordProviderFailure\(provider, errorCategory\)/)
  assert.match(route, /for \(const \[index, provider\] of aiProviderTargets/)
  assert.equal(route.includes('OpenRouter is unavailable'), false)
  assert.equal(route.includes('Gemini is unavailable'), false)
})
