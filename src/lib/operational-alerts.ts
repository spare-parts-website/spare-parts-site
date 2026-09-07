import 'server-only'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type AlertMetadata = Record<string, string | number | boolean | null | undefined>
const ALERT_COOLDOWN_MS = 5 * 60_000

function safeMetadata(metadata: AlertMetadata) {
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [key.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80), typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').slice(0, 240) : value]))
}

async function claimAlert(kind: string, now: Date) {
  const cutoff = new Date(now.getTime() - ALERT_COOLDOWN_MS)
  try {
    const rows = await db.$queryRaw<Array<{ kind: string }>>(Prisma.sql`
      INSERT INTO public."OperationalAlertDedup" (kind,"lastSentAt") VALUES (${kind},${now})
      ON CONFLICT (kind) DO UPDATE SET "lastSentAt"=EXCLUDED."lastSentAt"
      WHERE public."OperationalAlertDedup"."lastSentAt" < ${cutoff}
      RETURNING kind
    `)
    return rows.length === 1
  } catch (error) {
    // Fail closed. During a database incident it is safer to keep one structured
    // Vercel log than to let every Fluid Compute instance send the same page.
    console.error(JSON.stringify({ event: 'operational_alert.dedupe_failed', kind: kind.slice(0, 100), error: error instanceof Error ? error.name : 'unknown' }))
    return false
  }
}

export async function notifyOperationalAlert(kind: string, metadata: AlertMetadata = {}) {
  const endpoint = process.env.OPERATIONAL_ALERT_WEBHOOK_URL?.trim() || ''
  if (!/^https:\/\//i.test(endpoint)) return false
  const normalizedKind = kind.slice(0, 100)
  const now = new Date()
  if (!await claimAlert(normalizedKind, now)) return false
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'ghyar-market-alerts/2' }
  const token = process.env.OPERATIONAL_ALERT_WEBHOOK_TOKEN?.trim()
  if (token) headers.authorization = `Bearer ${token.slice(0, 240)}`
  try {
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ source: 'ghyar-market', kind: normalizedKind, occurredAt: now.toISOString(), metadata: safeMetadata(metadata) }), signal: AbortSignal.timeout(3_000), cache: 'no-store' })
    if (!response.ok) { console.error(JSON.stringify({ event: 'operational_alert.failed', kind: normalizedKind, status: response.status })); return false }
    return true
  } catch (error) {
    console.error(JSON.stringify({ event: 'operational_alert.failed', kind: normalizedKind, error: error instanceof Error ? error.name : 'unknown' }))
    return false
  }
}

export async function resetOperationalAlertCooldowns() {
  if (process.env.NODE_ENV === 'production') return
  await db.$executeRaw`DELETE FROM public."OperationalAlertDedup"`
}
