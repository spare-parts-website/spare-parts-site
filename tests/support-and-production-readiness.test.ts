import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('support tickets enforce private ownership and failure-safe admin notification delivery', () => {
  const listRoute = read('src/app/api/support/tickets/route.ts')
  const detailRoute = read('src/app/api/support/tickets/[id]/route.ts')
  const notifications = read('src/lib/notifications.ts')
  const migration = read('prisma/support-tickets.sql')
  assert.match(listRoute, /userId: session\.id/)
  assert.match(listRoute, /Promise\.allSettled\(admins\.map/)
  assert.match(listRoute, /createNotification/)
  assert.doesNotMatch(listRoute, /sendSupportTicketEmail|SUPPORT_EMAIL_(?:SENT|SKIPPED|FAILED)/)
  assert.match(listRoute, /filters\.status/)
  assert.match(listRoute, /filters\.category/)
  assert.match(detailRoute, /loadTicket\(id, session\.id, session\.role === 'ADMIN'\)/)
  assert.match(detailRoute, /session\.role !== 'ADMIN'/)
  assert.match(notifications, /shouldSendNonessentialEmail/)
  assert.match(notifications, /idempotencyKey: `notification\//)
  assert.match(notifications, /recordEmailDeliveryAttempt/)
  assert.match(migration, /enable row level security/i)
})

test('admin assist creates inside the seller store and audits the mutation', () => {
  const route = read('src/app/api/admin/parts/route.ts')
  const dialog = read('src/components/admin-create-part-dialog.tsx')
  assert.match(route, /requireRole\('ADMIN'\)/)
  assert.match(route, /store\.ownerId !== sellerId/)
  assert.match(route, /storeId: store\.id/)
  assert.match(route, /ADMIN_PART_CREATED/)
  assert.match(route, /sellerId: target\.store\.ownerId/)
  assert.match(dialog, /\/api\/admin\/parts/)
})

test('public marketplace details advertise shared caching while viewer overlays stay private', () => {
  const page = read('src/app/[...route]/page.tsx')
  const partsPage = read('src/app/parts/page.tsx')
  const partPage = read('src/app/parts/[id]/page.tsx')
  const storesPage = read('src/app/stores/page.tsx')
  const storePage = read('src/app/stores/[id]/page.tsx')
  const publicMarketplace = read('src/lib/public-marketplace.ts')
  const parts = read('src/app/api/parts/route.ts')
  const stores = read('src/app/api/stores/route.ts')
  const support = read('src/app/api/support/tickets/route.ts')
  const breadcrumbs = read('src/components/breadcrumbs.tsx')
  assert.match(page, /export const revalidate = 30/)
  assert.match(page, /getPublicPart\(id, null\)/)
  assert.match(page, /getPublicStore\(id, null\)/)
  assert.match(page, /unstable_noStore\(\)/)
  assert.match(parts, /viewerRequested \? 'private, no-store, max-age=0' : 'public, s-maxage=30/)
  assert.match(stores, /viewerRequested \? 'private, no-store, max-age=0' : 'public, s-maxage=30/)

  // The hot list HTML waits for a request so Next can apply the CSP nonce, but
  // the shared default marketplace data remains cached for 30 seconds.
  assert.match(partsPage, /await connection\(\)/)
  assert.match(storesPage, /await connection\(\)/)
  assert.match(publicMarketplace, /loadDefaultPublicPartsList = unstable_cache\([\s\S]*?\['public-parts-default-v1'\],[\s\S]*?\{ revalidate: 30 \}/)
  assert.match(publicMarketplace, /loadDefaultPublicStoresList = unstable_cache\([\s\S]*?\['public-stores-default-v1'\],[\s\S]*?\{ revalidate: 30 \}/)

  for (const publicDetailPage of [partPage, storePage]) {
    assert.match(publicDetailPage, /export const revalidate = 30/)
  }
  // Public detail pages read the request-scoped CSP nonce, so they must stay
  // dynamic; cacheable anonymous API responses still provide the data cache.
  assert.match(partPage, /export const dynamic = 'force-dynamic'/)
  assert.match(storePage, /export const dynamic = 'force-dynamic'/)
  assert.doesNotMatch(partPage, /generateStaticParams/)
  assert.doesNotMatch(storePage, /generateStaticParams/)
  assert.match(support, /const PRIVATE_HEADERS = \{ 'Cache-Control': 'private, no-store, max-age=0' \}/)
  assert.match(breadcrumbs, /BreadcrumbList/)
})

test('support inbox exposes admin filters without a route-wide loading takeover', () => {
  const view = read('src/components/views/support-view.tsx')
  const input = read('src/components/ui/input.tsx')
  const textarea = read('src/components/ui/textarea.tsx')
  assert.match(view, /كل الحالات/)
  assert.match(view, /كل التصنيفات/)
  assert.match(view, /ابحث برقم التذكرة/)
  assert.match(view, /WAITING_FOR_SUPPORT/)
  assert.match(view, /SUPPORT_REFRESH_INTERVAL/)
  assert.match(view, /window\.setInterval\(refresh, SUPPORT_REFRESH_INTERVAL\)/)
  assert.match(view, /visibilitychange/)
  assert.doesNotMatch(view, /LifeBuoy/)
  assert.match(input, /dir="auto"/)
  assert.match(textarea, /dir="auto"/)
  assert.equal(existsSync(new URL('../src/app/loading.tsx', import.meta.url)), false)
})

test('latest approved logo is wired to favicon, app chrome, and service worker', () => {
  const layout = read('src/app/layout.tsx')
  const header = read('src/components/header.tsx')
  const auth = read('src/components/views/auth-view.tsx')
  const config = read('next.config.ts')
  const worker = read('public/sw.js')
  assert.match(layout, /icon: "\/ghyar-market-logo\.png"/)
  assert.match(layout, /alternates: \{ canonical: '\/' \}/)
  assert.match(header, /src="\/ghyar-market-logo\.png"/)
  assert.match(auth, /src="\/ghyar-market-logo\.png"/)
  assert.match(config, /destination: '\/ghyar-market-logo\.png'/)
  assert.match(worker, /\/ghyar-market-logo\.png/)
})
