import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('buyer and seller order screens consume cursor list/detail APIs', () => {
  const buyer = read('src/components/views/orders-view.tsx')
  const seller = read('src/components/views/seller-orders-view.tsx')
  for (const source of [buyer, seller]) {
    assert.match(source, /\/api\/orders\/list\?/)
    assert.match(source, /\/api\/orders\/detail\?id=/)
    assert.match(source, /nextCursor/)
    assert.match(source, /تحميل المزيد/)
  }
  assert.doesNotMatch(buyer, /fetch\('\/api\/orders\?scope=buyer'/)
})

test('support list, detail and messages stay bounded', () => {
  const listApi = read('src/app/api/support/tickets/route.ts')
  const detailApi = read('src/app/api/support/tickets/[id]/route.ts')
  const view = read('src/components/views/support-view.tsx')
  assert.match(listApi, /take: limit \+ 1/)
  assert.match(listApi, /messageCount/)
  assert.match(listApi, /lastMessage/)
  assert.match(detailApi, /supportMessage\.findMany/)
  assert.match(detailApi, /take: limit \+ 1/)
  assert.match(detailApi, /nextCursor/)
  assert.doesNotMatch(detailApi, /messages:\s*\{\s*orderBy:\s*\{\s*createdAt:\s*'asc'/)
  assert.match(view, /تحميل رسائل أقدم/)
  assert.match(view, /nextCursor/)
})

test('public fuzzy search hydrates one page instead of hundreds of full products', () => {
  const marketplace = read('src/lib/public-marketplace.ts')
  assert.doesNotMatch(marketplace, /take:\s*rankSearchResults\s*\?\s*300/)
  assert.match(marketplace, /pageIds/)
  assert.match(marketplace, /id:\s*\{\s*in:\s*pageIds\s*\}/)
  assert.match(marketplace, /storeReview\.groupBy/)
  assert.match(marketplace, /storeReview\.aggregate/)
  assert.doesNotMatch(marketplace, /isDevelopmentReviewAuthor/)
})

test('filtered parts deep links are rendered from URL search params on the server', () => {
  const page = read('src/app/parts/page.tsx')
  assert.match(page, /searchParams:\s*Promise/)
  assert.match(page, /const params = await searchParams/)
  assert.match(page, /search:\s*first\(params\.search\)/)
  assert.match(page, /category:\s*first\(params\.category\)/)
  assert.match(page, /brand:\s*first\(params\.brand\)/)
  assert.match(page, /condition:\s*first\(params\.condition\)/)
  assert.match(page, /page:\s*boundedPage\(first\(params\.page\)\)/)
  assert.match(page, /getPublicPartsList\(initialQuery\)/)
  assert.match(page, /<PartsView initialData=\{initialData\} initialQuery=\{initialQuery\}/)
})

test('seller analytics remains aggregate-only', () => {
  const analytics = read('src/app/api/shop/analytics/route.ts')
  assert.match(analytics, /order\.aggregate/)
  assert.match(analytics, /order\.groupBy/)
  assert.match(analytics, /date_trunc\('month'/)
  assert.doesNotMatch(analytics, /order\.findMany/)
})

test('support message cursor index is part of the migration set', () => {
  const migration = read('supabase/migrations/20260907015000_support_message_cursor_index.sql')
  assert.match(migration, /SupportMessage_ticketId_createdAt_id_idx/)
  assert.match(migration, /createdAt" DESC, id DESC/)
})
