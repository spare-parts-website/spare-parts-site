import 'server-only'

type AlertMetadata = Record<string, string | number | boolean | null | undefined>

const lastSent = new Map<string, number>()
const ALERT_COOLDOWN_MS = 5 * 60_000

function safeMetadata(metadata: AlertMetadata) {
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    key.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80),
    typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').slice(0, 240) : value,
  ]))
}

/**
 * Send a small, optional operational alert to a configured incident sink.
 * The application remains healthy when no sink is configured or the sink is
 * unavailable; Vercel's structured logs remain the source of truth.
 */
export async function notifyOperationalAlert(kind: string, metadata: AlertMetadata = {}) {
  const endpoint = process.env.OPERATIONAL_ALERT_WEBHOOK_URL?.trim() || ''
  if (!/^https:\/\//i.test(endpoint)) return false
  const now = Date.now()
  const previous = lastSent.get(kind) || 0
  if (now - previous < ALERT_COOLDOWN_MS) return false
  lastSent.set(kind, now)
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'ghyar-market-alerts/1' }
  const token = process.env.OPERATIONAL_ALERT_WEBHOOK_TOKEN?.trim()
  if (token) headers.authorization = `Bearer ${token.slice(0, 240)}`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'ghyar-market', kind: kind.slice(0, 100), occurredAt: new Date(now).toISOString(), metadata: safeMetadata(metadata) }),
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    })
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'operational_alert.failed', kind: kind.slice(0, 100), status: response.status }))
      return false
    }
    return true
  } catch (error) {
    console.error(JSON.stringify({ event: 'operational_alert.failed', kind: kind.slice(0, 100), error: error instanceof Error ? error.name : 'unknown' }))
    return false
  }
}

/** Test helper; it does not affect production behavior. */
export function resetOperationalAlertCooldowns() {
  lastSent.clear()
}
