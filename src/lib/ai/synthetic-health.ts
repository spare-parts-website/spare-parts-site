import 'server-only'

import { generateText, gateway } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { aiModel, aiPaidPrimaryModel, aiProviderTargets, type AIProviderTarget } from '@/lib/ai/runtime'
import { publishProviderHealthSnapshot, recordProviderFailure, recordProviderSuccess, sharedProviderHealthSnapshot } from '@/lib/ai/provider-health'

function syntheticModel(provider: AIProviderTarget) {
  if (provider === 'gateway-minimax-free') return gateway('minimax/minimax-m3')
  if (provider === 'google') {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('NOT_CONFIGURED')
    return createGoogle({ apiKey: key })(aiModel())
  }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('NOT_CONFIGURED')
  if (provider === 'openrouter-primary') {
    const model = aiPaidPrimaryModel()
    if (!model) throw new Error('NOT_CONFIGURED')
    return createOpenRouter({ apiKey: key })(model)
  }
  if (provider === 'openrouter-glm-free') return createOpenRouter({ apiKey: key })('z-ai/glm-5.2:free')
  if (provider === 'openrouter-gemma-free') return createOpenRouter({ apiKey: key })('google/gemma-4-31b-it:free')
  throw new Error('NOT_CONFIGURED')
}

export async function runSyntheticProviderHealth() {
  const providers = aiProviderTargets()
  const results: Array<{ provider: AIProviderTarget; ok: boolean; latencyMs: number; category?: string }> = []
  for (const provider of providers) {
    const started = Date.now()
    try {
      await generateText({ model: syntheticModel(provider), prompt: 'Reply with OK only.', maxOutputTokens: 4, temperature: 0, abortSignal: AbortSignal.timeout(8_000), maxRetries: 0 })
      recordProviderSuccess(provider)
      results.push({ provider, ok: true, latencyMs: Date.now() - started })
    } catch (error) {
      const category = error instanceof Error && error.message === 'NOT_CONFIGURED' ? 'not_configured' : 'synthetic_probe_failed'
      recordProviderFailure(provider, category)
      results.push({ provider, ok: false, latencyMs: Date.now() - started, category })
    }
  }
  await publishProviderHealthSnapshot()
  return { ok: results.some((item) => item.ok), results, shared: await sharedProviderHealthSnapshot() }
}
