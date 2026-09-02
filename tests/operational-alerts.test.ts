import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('operational alerts are optional, bounded, and never expose secrets', () => {
  const source = readFileSync(new URL('../src/lib/operational-alerts.ts', import.meta.url), 'utf8')
  assert.match(source, /OPERATIONAL_ALERT_WEBHOOK_URL/)
  assert.match(source, /AbortSignal\.timeout\(3_000\)/)
  assert.match(source, /ALERT_COOLDOWN_MS/)
  assert.match(source, /safeMetadata/)
  assert.doesNotMatch(source, /RESEND_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY/)
})

test('critical provider and email failures emit alert events without blocking responses', () => {
  const ai = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  const webhook = readFileSync(new URL('../src/app/api/webhooks/resend/route.ts', import.meta.url), 'utf8')
  assert.match(ai, /notifyOperationalAlert\('ai\.all_providers_failed'/)
  assert.match(webhook, /notifyOperationalAlert\('email\.delivery\.permanent_failure'/)
  assert.match(ai, /void notifyOperationalAlert/)
  assert.match(webhook, /void notifyOperationalAlert/)
})
