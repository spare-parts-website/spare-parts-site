import 'server-only'

import { Prisma } from '@prisma/client'
import { db } from '../db.ts'
import { providerHealthSnapshot, type AIProviderHealth } from './provider-health.ts'
import type { AIProviderTarget } from './runtime.ts'

export type SharedProviderHealth = AIProviderHealth & { status: 'HEALTHY' | 'DEGRADED' | 'OPEN'; updatedAt: string; stale: boolean }

type SharedRow = { provider: AIProviderTarget; status: 'HEALTHY' | 'DEGRADED' | 'OPEN'; consecutiveFailures: number; circuitOpenUntil: Date | null; lastFailureCategory: string | null; lastSuccessAt: Date | null; lastFailureAt: Date | null; updatedAt: Date }
const SHARED_STALE_MS = 26 * 60 * 60_000

export async function publishProviderHealthSnapshot(now = Date.now()) {
  const snapshot = providerHealthSnapshot(now)
  for (const row of snapshot) {
    const status = row.circuitOpen ? 'OPEN' : row.consecutiveFailures > 0 ? 'DEGRADED' : 'HEALTHY'
    await db.$executeRaw(Prisma.sql`
      INSERT INTO public."AIProviderHealth" (provider,status,"consecutiveFailures","circuitOpenUntil","lastFailureCategory","lastSuccessAt","lastFailureAt","updatedAt")
      VALUES (${row.provider},${status},${row.consecutiveFailures},${row.openedUntil ? new Date(row.openedUntil) : null},${row.lastFailureCategory},${row.lastSuccessAt ? new Date(row.lastSuccessAt) : null},${row.lastFailureAt ? new Date(row.lastFailureAt) : null},CURRENT_TIMESTAMP)
      ON CONFLICT (provider) DO UPDATE SET status=EXCLUDED.status,"consecutiveFailures"=EXCLUDED."consecutiveFailures","circuitOpenUntil"=EXCLUDED."circuitOpenUntil","lastFailureCategory"=EXCLUDED."lastFailureCategory","lastSuccessAt"=EXCLUDED."lastSuccessAt","lastFailureAt"=EXCLUDED."lastFailureAt","updatedAt"=CURRENT_TIMESTAMP
    `)
  }
  return snapshot.length
}

export async function sharedProviderHealthSnapshot(now = Date.now()): Promise<SharedProviderHealth[]> {
  try {
    const rows = await db.$queryRaw<SharedRow[]>`SELECT provider,status,"consecutiveFailures","circuitOpenUntil","lastFailureCategory","lastSuccessAt","lastFailureAt","updatedAt" FROM public."AIProviderHealth" ORDER BY provider`
    return rows.map((row) => ({ provider: row.provider, status: row.status, consecutiveFailures: row.consecutiveFailures, circuitOpen: Boolean(row.circuitOpenUntil && row.circuitOpenUntil.getTime() > now), openedUntil: row.circuitOpenUntil?.toISOString() || null, lastFailureAt: row.lastFailureAt?.toISOString() || null, lastSuccessAt: row.lastSuccessAt?.toISOString() || null, lastFailureCategory: row.lastFailureCategory, updatedAt: row.updatedAt.toISOString(), stale: now - row.updatedAt.getTime() > SHARED_STALE_MS }))
  } catch { return [] }
}
