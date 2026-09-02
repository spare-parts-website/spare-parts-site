import { createHash, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { DEFAULT_AI_QUOTAS } from '@/lib/ai/policy'
import type { AIRole } from '@/lib/ai/types'

const CONCURRENCY: Record<AIRole, number> = {
  GUEST: 1,
  BUYER: 2,
  SHOP_OWNER: 3,
  ADMIN: 3,
}

const AI_MODEL = 'gemini-3.5-flash-lite'
export type AIProviderTarget = 'google' | 'openrouter-text-pool-a' | 'openrouter-text-pool-b' | 'openrouter-vision-pool' | 'openrouter' | 'gateway'
export const AI_MESSAGE_LIMIT = 4000
export const AI_HISTORY_TTL_MS = 60 * 60 * 1000
export const AI_PROPOSAL_TTL_MS = 10 * 60 * 1000
export const AI_DEDUPE_TTL_MS = 5_000

export function aiModel() {
  return AI_MODEL
}

export function aiProviderTargets(options?: { hasImage?: boolean }): AIProviderTarget[] {
  const targets: AIProviderTarget[] = []
  // The direct Google free quota is independent from OpenRouter and Gateway,
  // so prefer it before shared free routers.
  if (process.env.GEMINI_API_KEY) targets.push('google')
  if (process.env.OPENROUTER_API_KEY) {
    if (options?.hasImage) targets.push('openrouter-vision-pool')
    else targets.push('openrouter-text-pool-a', 'openrouter-text-pool-b')
    targets.push('openrouter')
  }
  // Vercel's included free Gateway credit is useful as a final independent
  // route, but it must not delay every request after its monthly cap is hit.
  targets.push('gateway')
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
