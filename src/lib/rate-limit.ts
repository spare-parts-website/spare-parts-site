import { db } from '@/lib/db'

type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

// Development-only fallback. Production fails closed if the durable database
// bucket is unavailable so abuse protection cannot silently disappear.
function memoryRateLimit(key: string, limit: number, windowMs: number) {
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

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date()
  const nextReset = new Date(now.getTime() + windowMs)
  try {
    const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      insert into "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      values (${key}, 1, ${nextReset}, CURRENT_TIMESTAMP)
      on conflict ("key") do update set
        "count" = case when "RateLimitBucket"."resetAt" <= ${now} then 1 else "RateLimitBucket"."count" + 1 end,
        "resetAt" = case when "RateLimitBucket"."resetAt" <= ${now} then ${nextReset} else "RateLimitBucket"."resetAt" end,
        "updatedAt" = CURRENT_TIMESTAMP
      returning "count", "resetAt"
    `
    const row = rows[0]
    return {
      allowed: row.count <= limit,
      retryAfter: row.count <= limit ? 0 : Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return memoryRateLimit(key, limit, windowMs)
  }
}

export function requestAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
