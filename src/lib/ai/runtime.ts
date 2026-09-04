import { createHash, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { DEFAULT_AI_QUOTAS } from '@/lib/ai/policy'
import type { AIRole } from '@/lib/ai/types'
import { aiPaidPrimaryModel } from './config'

export { aiPaidPrimaryModel } from './config'

const CONCURRENCY: Record<AIRole, number> = {
  GUEST: 1,
  BUYER: 2,
  SHOP_OWNER: 3,
  ADMIN: 3,
}

const AI_MODEL = 'gemini-3.5-flash-lite'
export type AIProviderTarget = 'openrouter-primary' | 'google' | 'openrouter-text-pool-a' | 'openrouter-text-pool-b' | 'openrouter-vision-pool' | 'openrouter' | 'gateway'
export const AI_MESSAGE_LIMIT = 4000
export const AI_HISTORY_TTL_MS = 60 * 60 * 1000
export const AI_PROPOSAL_TTL_MS = 10 * 60 * 1000
export const AI_DEDUPE_TTL_MS = 5_000

export function aiModel() {
  return AI_MODEL
}

export function aiProviderTargets(options?: { hasImage?: boolean; privateContext?: boolean }): AIProviderTarget[] {
  const targets: AIProviderTarget[] = []
  if (process.env.OPENROUTER_API_KEY && aiPaidPrimaryModel()) targets.push('openrouter-primary')

  // Direct Gemini is the most reliable authenticated path in the current
  // deployment. The previous release excluded it for every signed-in request,
  // which left only ZDR-enforced routes that the project's current provider
  // plans reject. Keep the user's role-safe tool boundaries server-side and
  // let the configured Gemini API handle both text and image requests first.
  if (process.env.GEMINI_API_KEY) targets.push('google')

  if (process.env.OPENROUTER_API_KEY) {
    // Signed-in requests must not be sent through the free model pools that are
    // configured with mandatory ZDR in agent.ts: those pools currently return
    // "No endpoints found matching your data policy". The generic OpenRouter
    // route is the existing compatible fallback and does not expose raw user IDs.
    if (options?.privateContext) {
      targets.push('openrouter')
      return targets
    }

    if (options?.hasImage) targets.push('openrouter-vision-pool')
    else {
      targets.push('openrouter-text-pool-a')
      targets.push('openrouter-text-pool-b')
    }
    targets.push('openrouter')
  }

  // Vercel AI Gateway ZDR is unavailable on the current Hobby plan and was a
  // guaranteed 403 fallback. Do not enqueue a provider path known to fail.
  return targets
}

export function aiQuota(role: AIRole) {
  const configured = Number(process.env[`AI_QUOTA_${role}`])
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_AI_QUOTAS[role]
}

export async function acquireAIConcurrency(key: string, role: AIRole) {
  const token = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 65_000)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${key}))`
    await tx.aIRequestLease.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { key, role: { not: role } }] } })
    const count = await tx.aIRequestLease.count({ where: { key, role, expiresAt: { gt: now } } })
    if (count >= CONCURRENCY[role]) return null
    await tx.aIRequestLease.create({ data: { key, token, role, expiresAt } })
    return token
  })
}

export async function releaseAIConcurrency(token: string) {
  await db.aIRequestLease.deleteMany({ where: { token } })
}

export function aiRequestFingerprint(input: { identity: string; clientRequestId?: string; conversationId?: string; message: string; parts?: unknown; selection?: unknown }) {
  const payload = JSON.stringify({
    identity: input.identity.slice(0, 160),
    clientRequestId: input.clientRequestId?.slice(0, 160) || undefined,
    conversationId: input.conversationId?.slice(0, 120) || undefined,
    message: input.message.trim().replace(/\s+/g, ' ').slice(0, 4000),
    parts: input.parts,
    selection: input.selection,
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Suppress rapid retries with the existing server-only lease table.  The key
 * prefix intentionally differs from the concurrency key so the two leases
 * never evict one another.  Rows are allowed to expire instead of being
 * released immediately, which closes the post-completion duplicate window.
 */
export async function acquireAIDedupLease(key: string) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + AI_DEDUPE_TTL_MS)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${key}))`
    await tx.aIRequestLease.deleteMany({ where: { expiresAt: { lte: now } } })
    const existing = await tx.aIRequestLease.findFirst({ where: { key, role: 'DEDUPE', expiresAt: { gt: now } }, select: { id: true } })
    if (existing) return { duplicate: true as const }
    await tx.aIRequestLease.create({ data: { key, token: randomUUID(), role: 'DEDUPE', expiresAt } })
    return { duplicate: false as const }
  })
}