import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('header and dashboard avoid speculative request bursts', () => {
  const header = read('src/components/header.tsx')
  const footer = read('src/components/footer.tsx')
  const shell = read('src/components/app-shell.tsx')
  const warmup = read('src/lib/dashboard-warmup.ts')

  assert.doesNotMatch(header, /routes\.forEach\(\(path\) => router\.prefetch/)
  assert.match(header, /const intentPrefetch/)
  assert.match(header, /prefetch: false as const/)
  assert.match(header, /onMouseEnter: \(\) => router\.prefetch\(path\)/)
  assert.match(header, /href="\/support" prefetch=\{false\}/)
  assert.match(header, /href="\/admin\/users" prefetch=\{false\}/)
  assert.match(footer, /prefetch=\{false\}/)
  assert.doesNotMatch(shell, /requestIdleCallback/)
  assert.doesNotMatch(shell, /dashboard-warmup/)
  assert.match(warmup, /await warmSellerCore\(userId, currentTab\)/)
  assert.doesNotMatch(warmup, /Promise\.allSettled/)
})

test('notification bell polls one tiny count endpoint and shares it across tabs', () => {
  const bell = read('src/components/notifications-bell.tsx')
  const countRoute = read('src/app/api/notifications/unread-count/route.ts')
  const listRoute = read('src/app/api/notifications/route.ts')

  assert.match(bell, /const POLL_INTERVAL_MS = 90_000/)
  assert.match(bell, /BroadcastChannel\(CHANNEL_NAME\)/)
  assert.match(bell, /LEADER_LEASE_MS = 120_000/)
  assert.match(bell, /fetch\('\/api\/notifications\/unread-count'/)
  assert.match(bell, /if \(nextOpen\) void loadNotifications\(\)/)
  assert.doesNotMatch(bell, /delay = 15000/)
  assert.match(countRoute, /db\.notification\.count/)
  assert.doesNotMatch(countRoute, /notification\.findMany/)
  assert.match(listRoute, /take: 50/)
})

test('session lookup is request-memoized without cross-request identity caching', () => {
  const auth = read('src/lib/auth.ts')
  assert.match(auth, /import \{ cache \} from 'react'/)
  assert.match(auth, /const loadSession\s*=\s*cache\(async/)
  assert.match(auth, /return loadSession\(\)/)
  assert.doesNotMatch(auth, /unstable_cache/)
  assert.match(auth, /sessionVersion/)
})

test('coarse abuse throttling runs before handlers without Postgres writes', () => {
  const proxy = read('src/proxy.ts')
  const coarse = read('src/lib/coarse-rate-limit.ts')
  const login = read('src/app/api/auth/login/route.ts')
  const register = read('src/app/api/auth/register/route.ts')
  const resend = read('src/app/api/auth/resend-login-code/route.ts')

  assert.match(proxy, /coarseApiLimit/)
  assert.match(proxy, /status: 429/)
  assert.doesNotMatch(coarse, /@\/lib\/db|RateLimitBucket|\$queryRaw/)
  assert.match(coarse, /auth-login/)
  assert.match(coarse, /public-search/)
  assert.match(coarse, /support/)
  assert.doesNotMatch(login, /login:ip:/)
  assert.match(login, /login:account:/)
  assert.doesNotMatch(register, /register:ip:/)
  assert.match(register, /register:account:/)
  assert.doesNotMatch(resend, /resend-login-code:\$\{requestAddress/)
})

test('AI global expiration scans belong only to daily maintenance', () => {
  const history = read('src/lib/ai/history.ts')
  const runtime = read('src/lib/ai/runtime.ts')
  const cleanup = read('src/app/api/ai/cleanup/route.ts')

  assert.match(history, /if \(!options\?\.global\) return \{ count: 0 \}/)
  assert.match(cleanup, /purgeExpiredAIData\(\{ global: true \}\)/)
  assert.match(runtime, /deleteMany\(\{ where: \{ key, OR:/)
  assert.match(runtime, /deleteMany\(\{ where: \{ key, expiresAt:/)
})

test('notification email is durable, asynchronous, and webhook-race safe', () => {
  const notifications = read('src/lib/notifications.ts')
  const outbox = read('src/lib/email-outbox.ts')
  const webhook = read('src/app/api/webhooks/resend/route.ts')
  const events = read('src/lib/email-webhook-events.ts')
  const migration = read('prisma/phase2-request-amplification-20260906.sql')

  assert.match(notifications, /queueEmailOutbox/)
  assert.match(notifications, /after\(async \(\) =>/)
  assert.doesNotMatch(notifications, /resend\.emails\.send/)
  assert.match(outbox, /status: 'PENDING'/)
  assert.match(outbox, /FOR UPDATE SKIP LOCKED/)
  assert.match(outbox, /idempotencyKey: row\.deliveryKey/)
  assert.match(outbox, /reconcileWebhookEvents\(providerId\)/)
  assert.match(webhook, /persistAndReconcileWebhookEvent/)
  assert.match(events, /ON CONFLICT \("webhookId"\) DO NOTHING/)
  assert.match(events, /"processedAt" IS NULL/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "EmailOutbox"/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "EmailWebhookEvent"/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /FROM PUBLIC, anon, authenticated/)
})

test('support create and reply paths have durable account-level limits', () => {
  const tickets = read('src/app/api/support/tickets/route.ts')
  const replies = read('src/app/api/support/tickets/[id]/route.ts')

  assert.match(tickets, /support:create:user:/)
  assert.match(tickets, /support:create:order:/)
  assert.match(replies, /support:reply:user:/)
  assert.match(replies, /support:reply:ticket:/)
  assert.match(tickets, /Retry-After/)
  assert.match(replies, /Retry-After/)
})
