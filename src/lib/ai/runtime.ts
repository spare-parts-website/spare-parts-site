import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { DEFAULT_AI_QUOTAS } from '@/lib/ai/policy'
import type { AIRole } from '@/lib/ai/types'

const CONCURRENCY: Record<AIRole, number> = {
  GUEST: 1,
  BUYER: 2,
  SHOP_OWNER: 3,
  ADMIN: 3,
}

export const AI_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'stealth/ox-alpha'
export const AI_MESSAGE_LIMIT = 4000
export const AI_HISTORY_TTL_MS = 60 * 60 * 1000
export const AI_PROPOSAL_TTL_MS = 10 * 60 * 1000

export function aiQuota(role: AIRole) {
  const configured = Number(process.env[`AI_QUOTA_${role}`])
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_AI_QUOTAS[role]
}

export async function acquireAIConcurrency(key: string, role: AIRole) {
  const token = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 35_000)
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
