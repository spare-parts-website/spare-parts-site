type Bucket = { count: number; resetAt: number }

const globalState = globalThis as typeof globalThis & { __ghyarCoarseRateLimit?: Map<string, Bucket> }
const buckets = globalState.__ghyarCoarseRateLimit || new Map<string, Bucket>()
if (!globalState.__ghyarCoarseRateLimit) globalState.__ghyarCoarseRateLimit = buckets

const MAX_BUCKETS = 20_000

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
    if (buckets.size < MAX_BUCKETS / 2) break
  }
  if (buckets.size >= MAX_BUCKETS) {
    let removed = 0
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (++removed >= Math.ceil(MAX_BUCKETS / 4)) break
    }
  }
}

export function coarseRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  prune(now)
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  current.count += 1
  return {
    allowed: current.count <= limit,
    retryAfter: current.count <= limit ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export function coarseApiLimit(pathname: string, method: string, address: string) {
  const upperMethod = method.toUpperCase()
  const rule =
    upperMethod === 'POST' && pathname === '/api/auth/login' ? { id: 'auth-login', limit: 20, windowMs: 60_000 } :
    upperMethod === 'POST' && pathname === '/api/auth/register' ? { id: 'auth-register', limit: 10, windowMs: 10 * 60_000 } :
    upperMethod === 'POST' && pathname === '/api/auth/resend-login-code' ? { id: 'auth-resend', limit: 6, windowMs: 15 * 60_000 } :
    upperMethod === 'POST' && (pathname === '/api/auth/verify-login' || pathname === '/api/auth/verify-admin-mfa' || pathname === '/api/auth/admin-mfa/step-up') ? { id: 'auth-verify', limit: 30, windowMs: 15 * 60_000 } :
    upperMethod === 'GET' && pathname === '/api/search' ? { id: 'public-search', limit: 120, windowMs: 60_000 } :
    upperMethod === 'POST' && pathname === '/api/ai' ? { id: 'ai', limit: 30, windowMs: 60_000 } :
    upperMethod === 'POST' && (pathname === '/api/support/tickets' || pathname.startsWith('/api/support/tickets/')) ? { id: 'support', limit: 30, windowMs: 10 * 60_000 } :
    null
  if (!rule) return { allowed: true, retryAfter: 0 }
  return coarseRateLimit(`${rule.id}:${address}`, rule.limit, rule.windowMs)
}
