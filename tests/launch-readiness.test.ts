import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('public marketplace shows only sellers with active inventory and evidence-based trust states', () => {
  const home = read('src/components/views/home-view.tsx')
  const homeData = read('src/lib/home-marketplace-data.ts')
  const homeSections = read('src/components/home-marketplace-sections.tsx')
  const publicMarketplace = read('src/lib/public-marketplace.ts')
  const stores = read('src/components/views/stores-view.tsx')

  assert.match(homeData, /where: \{ moderationStatus: 'ACTIVE', parts: \{ some: \{ blocked: false \} \} \}/)
  assert.match(homeData, /store: \{ moderationStatus: 'ACTIVE' \}/)
  assert.match(homeData, /orderBy: \[\{ verified: 'desc' \}, \{ createdAt: 'desc' \}\]/)
  assert.match(homeSections, /store\.reviewCount > 0/)
  assert.match(homeSections, /لا توجد تقييمات بعد/)
  assert.match(homeSections, /لم يضف المتجر وصفاً بعد/)
  assert.doesNotMatch(home, /دفع آمن عند الاستلام/)
  assert.doesNotMatch(homeSections, /متجر متخصص في بيع قطع غيار السيارات\./)

  assert.match(publicMarketplace, /const visibleStoreWhere: Prisma\.StoreWhereInput = \{ moderationStatus: 'ACTIVE' \}/)
  assert.match(publicMarketplace, /const listableStoreWhere/)
  assert.match(publicMarketplace, /parts: \{ some: \{ blocked: false \} \}/)
  assert.match(publicMarketplace, /\.\.\.listableStoreWhere/)

  assert.match(stores, /متجر لديه قطع معروضة/)
  assert.match(stores, /store\.reviewCount > 0/)
  assert.match(stores, /store\.completedOrderCount > 0/)
  assert.match(stores, /لا توجد تقييمات بعد/)
})

test('consumer-facing legal copy is Egypt-focused and no longer contains development disclaimers', () => {
  const legal = read('src/components/views/legal-view.tsx')
  assert.match(legal, /14 يوماً/)
  assert.match(legal, /30 يوماً/)
  assert.match(legal, /جهاز حماية المستهلك المصري/)
  assert.match(legal, /لا تنتقص هذه الشروط من أي حق إلزامي/)
  assert.doesNotMatch(legal, /تحتاج مراجعة قانونية محلية قبل الإطلاق التجاري/)
  assert.doesNotMatch(legal, /هذه المعلومات عامة وليست استشارة قانونية/)
})

test('support ticket creation has one durable admin notification delivery path', () => {
  const route = read('src/app/api/support/tickets/route.ts')
  const notifications = read('src/lib/notifications.ts')
  const outbox = read('src/lib/email-outbox.ts')

  assert.match(route, /createNotification/)
  assert.match(route, /dedupeKey:\s*`support-ticket\/\$\{result\.ticket\.id\}\/\$\{admin\.id\}`/)
  assert.doesNotMatch(route, /sendSupportTicketEmail/)
  assert.match(notifications, /shouldSendNonessentialEmail\(recipient\.emailDeliveryStatus\)/)
  assert.match(notifications, /queueEmailOutbox/)
  assert.doesNotMatch(notifications, /resend\.emails\.send/)
  assert.match(outbox, /recordEmailDeliveryAttempt/)
  assert.match(outbox, /status: 'PENDING'/)
})

test('Supabase Data API roles are explicitly denied application table access', () => {
  const migration = read('prisma/data-api-lockdown.sql')
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE/i)
  assert.match(migration, /FROM anon, authenticated/i)
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL SEQUENCES/i)
  assert.match(migration, /ALTER DEFAULT PRIVILEGES/i)
  assert.doesNotMatch(migration, /\bDROP\b|\bTRUNCATE\b|\bDELETE\b/i)
})

test('strict CSP remains nonce-based on all HTML while cacheable JSON avoids nonce work', () => {
  const layout = read('src/app/layout.tsx')
  const homePage = read('src/app/page.tsx')
  const partsPage = read('src/app/parts/page.tsx')
  const storesPage = read('src/app/stores/page.tsx')
  const proxy = read('src/proxy.ts')
  const config = read('next.config.ts')

  assert.doesNotMatch(layout, /export const dynamic = 'force-dynamic'/)
  assert.match(homePage, /await connection\(\)/)
  assert.match(partsPage, /await connection\(\)/)
  assert.match(storesPage, /await connection\(\)/)
  assert.match(proxy, /script-src 'self' 'nonce-\$\{value\}'/)
  assert.match(proxy, /pathname\.startsWith\('\/api\/'\)/)
  assert.match(proxy, /api\/home-marketplace\$/)
  assert.match(proxy, /frame-ancestors 'none'/)
  assert.doesNotMatch(proxy, /STATIC_PUBLIC_PATHS/)
  assert.doesNotMatch(proxy, /script-src[^\n]*unsafe-inline/)
  assert.match(config, /sri:\s*\{\s*algorithm:\s*'sha256'/)
  assert.doesNotMatch(config, /publicStaticCsp/)
  assert.doesNotMatch(config, /Content-Security-Policy/)
  assert.match(config, /X-Frame-Options/)
})
