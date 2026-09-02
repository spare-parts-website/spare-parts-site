import type { AIProviderTarget } from '@/lib/ai/runtime'

export type ProviderFailureCategory = string

export type AIProviderHealth = {
  provider: AIProviderTarget
  consecutiveFailures: number
  circuitOpen: boolean
  openedUntil: string | null
  lastFailureAt: string | null
  lastSuccessAt: string | null
  lastFailureCategory: ProviderFailureCategory | null
}

const FAILURE_THRESHOLD = 3
const BASE_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_MS = 5 * 60_000
const BACKOFF_BASE_MS = 150
const BACKOFF_MAX_MS = 1_000

type ProviderState = {
  consecutiveFailures: number
  openedUntil: number
  lastFailureAt: number | null
  lastSuccessAt: number | null
  lastFailureCategory: ProviderFailureCategory | null
}

const states = new Map<AIProviderTarget, ProviderState>()

function stateFor(provider: AIProviderTarget) {
  const existing = states.get(provider)
  if (existing) return existing
  const created: ProviderState = { consecutiveFailures: 0, openedUntil: 0, lastFailureAt: null, lastSuccessAt: null, lastFailureCategory: null }
  states.set(provider, created)
  return created
}

export function isProviderCircuitOpen(provider: AIProviderTarget, now = Date.now()) {
  return stateFor(provider).openedUntil > now
}

export function providerBackoffMs(attemptIndex: number) {
  if (attemptIndex <= 0) return 0
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * (2 ** Math.min(attemptIndex - 1, 3)))
}

export function recordProviderSuccess(provider: AIProviderTarget, now = Date.now()) {
  const state = stateFor(provider)
  state.consecutiveFailures = 0
  state.openedUntil = 0
  state.lastSuccessAt = now
  state.lastFailureCategory = null
}

export function recordProviderFailure(provider: AIProviderTarget, category: ProviderFailureCategory, now = Date.now()) {
  const state = stateFor(provider)
  state.consecutiveFailures += 1
  state.lastFailureAt = now
  state.lastFailureCategory = category.slice(0, 64)
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    const exponent = Math.min(state.consecutiveFailures - FAILURE_THRESHOLD, 4)
    state.openedUntil = now + Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * (2 ** exponent))
  }
  return { consecutiveFailures: state.consecutiveFailures, circuitOpened: state.openedUntil > now, openedUntil: state.openedUntil }
}

export function providerHealthSnapshot(now = Date.now()): AIProviderHealth[] {
  return [...states.entries()].map(([provider, state]) => ({
    provider,
    consecutiveFailures: state.consecutiveFailures,
    circuitOpen: state.openedUntil > now,
    openedUntil: state.openedUntil ? new Date(state.openedUntil).toISOString() : null,
    lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
    lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
    lastFailureCategory: state.lastFailureCategory,
  }))
}

/** Test-only reset that keeps the production module free of external state. */
export function resetProviderHealth() {
  states.clear()
}
