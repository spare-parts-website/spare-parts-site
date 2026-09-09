import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('admin dashboard no longer performs the legacy all-dataset fanout', () => {
  const dashboard = read('src/components/views/admin-dashboard-view.tsx')
  assert.doesNotMatch(dashboard, /Promise\.all\(\s*\[\s*fetch\('\/api\/admin\/users'/)
  assert.match(dashboard, /AdminListView/)
  assert.match(dashboard, /AdminReviewsView/)
})

test('admin high-volume consumers expose incremental pagination', () => {
  const list = read('src/components/views/admin-list-view.tsx')
  const reviews = read('src/components/views/admin-reviews-view.tsx')
  const moderation = read('src/components/moderation-center.tsx')
  for (const source of [list, reviews, moderation]) assert.match(source, /nextCursor/)
  assert.match(list, /تحميل المزيد/)
  assert.match(reviews, /تحميل المزيد/)
  assert.match(moderation, /loadVerifications\(true\)/)
  assert.match(moderation, /loadDisputes\(true\)/)
})

test('review and moderation APIs return bounded summary rows', () => {
  const reviews = read('src/app/api/admin/reviews/route.ts')
  const moderation = read('src/app/api/admin/moderation/route.ts')
  assert.match(reviews, /take: limit \+ 1/)
  assert.match(reviews, /encodeCursor/)
  assert.doesNotMatch(moderation, /dispute\.findMany/)
  assert.doesNotMatch(moderation, /sellerVerification\.findMany/)
  assert.match(moderation, /auditLog\.findMany/)
  assert.match(moderation, /take: 20/)
})

test('verification and dispute details are loaded on demand from paginated APIs', () => {
  const moderation = read('src/components/moderation-center.tsx')
  assert.match(moderation, /seller-verification\?scope=admin&id=/)
  assert.match(moderation, /disputes\?scope=admin&id=/)
  const verification = read('src/app/api/seller-verification/route.ts')
  const disputes = read('src/app/api/disputes/route.ts')
  assert.match(verification, /decodeCursor/)
  assert.match(disputes, /decodeCursor/)
})
