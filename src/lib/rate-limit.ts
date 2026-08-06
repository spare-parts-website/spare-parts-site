type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

// Best-effort protection for serverless instances. Use a shared limiter such as
// Upstash Redis when traffic grows beyond a single deployment instance.
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  existing.count += 1
  return {
    allowed: existing.count <= limit,
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

export function requestAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
