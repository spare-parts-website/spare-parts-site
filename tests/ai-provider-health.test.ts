import assert from 'node:assert/strict'
import test from 'node:test'
import { isProviderCircuitOpen, providerBackoffMs, providerHealthSnapshot, recordProviderFailure, recordProviderSuccess, resetProviderHealth } from '../src/lib/ai/provider-health.ts'

test('opens an AI provider circuit after repeated failures and recovers on success', () => {
  resetProviderHealth()
  const provider = 'google' as const
  assert.equal(isProviderCircuitOpen(provider, 1_000), false)
  recordProviderFailure(provider, 'timeout', 1_000)
  recordProviderFailure(provider, 'timeout', 2_000)
  const opened = recordProviderFailure(provider, 'timeout', 3_000)
  assert.equal(opened.circuitOpened, true)
  assert.equal(isProviderCircuitOpen(provider, 3_001), true)
  assert.equal(providerHealthSnapshot(3_001)[0]?.lastFailureCategory, 'timeout')
  recordProviderSuccess(provider, 4_000)
  assert.equal(isProviderCircuitOpen(provider, 4_001), false)
  assert.equal(providerHealthSnapshot(4_001)[0]?.consecutiveFailures, 0)
})

test('keeps retry backoff bounded and exponential', () => {
  assert.equal(providerBackoffMs(0), 0)
  assert.equal(providerBackoffMs(1), 150)
  assert.equal(providerBackoffMs(2), 300)
  assert.equal(providerBackoffMs(3), 600)
  assert.equal(providerBackoffMs(99), 1_000)
})
