import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderLine, InvalidOrderTransition, resolveOrderTransition } from '../src/lib/order-state.ts'
import { evaluateFitment, parseVehicleCompatibility, serializeLegacyCompatibility } from '../src/lib/vehicle-compatibility.ts'
import { loginCodeEmailHtml, notificationEmailHtml, passwordResetEmailHtml } from '../src/lib/email-templates.ts'
import { requiresLoginCode } from '../src/lib/login-policy.ts'
import { buildGroupedOrderDrafts } from '../src/lib/grouped-orders.ts'
import { buildMarketplaceSearchQueries, normalizeMarketplaceSearch } from '../src/lib/search-normalization.ts'
import { normalizeEgyptianMobile } from '../src/lib/egyptian-phone.ts'
import { normalizeProductCondition, schemaConditionUrl } from '../src/lib/product-condition.ts'
import { normalizeMarketplaceBrand, normalizeMarketplaceCategory, normalizeMarketplaceCondition } from '../src/lib/marketplace-taxonomy.ts'
import { readFileSync } from 'node:fs'

test('calculates coupon discount against quantity without floating-point drift', () => {
  assert.deepEqual(calculateOrderLine(125.5, 2, 10), { subtotal: 251, discount: 25.1, total: 225.9 })
  assert.deepEqual(calculateOrderLine(100, 1, 150), { subtotal: 100, discount: 100, total: 0 })
})

test('enforces COD order transitions and stock restoration rules', () => {
  assert.deepEqual(
    resolveOrderTransition({ action: 'approve', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    { status: 'APPROVED', paymentStatus: 'UNPAID', restoreStock: false },
  )
  assert.deepEqual(
    resolveOrderTransition({ action: 'ship', status: 'APPROVED', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    { status: 'SHIPPED', paymentStatus: 'UNPAID', restoreStock: false },
  )
  assert.deepEqual(
    resolveOrderTransition({ action: 'deliver', status: 'SHIPPED', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    { status: 'DELIVERED', paymentStatus: 'PAID', restoreStock: false },
  )
  assert.deepEqual(
    resolveOrderTransition({ action: 'cancel', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    { status: 'CANCELLED', paymentStatus: 'UNPAID', restoreStock: true },
  )
})

test('rejects invalid order transitions', () => {
  assert.throws(
    () => resolveOrderTransition({ action: 'deliver', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    InvalidOrderTransition,
  )
  assert.throws(
    () => resolveOrderTransition({ action: 'pay', status: 'APPROVED', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
    InvalidOrderTransition,
  )
})

test('groups checkout items into one order per seller with one shipping fee', () => {
  const drafts = buildGroupedOrderDrafts([
    { partId: 'a1', storeId: 'seller-a', ownerId: 'owner-a', storeName: 'متجر أ', productName: 'فرامل', unitPrice: 100, quantity: 2 },
    { partId: 'a2', storeId: 'seller-a', ownerId: 'owner-a', storeName: 'متجر أ', productName: 'فلتر', unitPrice: 50, quantity: 1 },
    { partId: 'b1', storeId: 'seller-b', ownerId: 'owner-b', storeName: 'متجر ب', productName: 'موتور', unitPrice: 200, quantity: 1 },
  ], 60, { storeId: 'seller-a', code: 'SAVE10', discountPercent: 10 })

  assert.equal(drafts.length, 2)
  assert.deepEqual(drafts[0], {
    storeId: 'seller-a', ownerId: 'owner-a', storeName: 'متجر أ', couponCode: 'SAVE10', shippingFee: 60,
    totalQuantity: 3, discount: 25, itemsTotal: 225, totalPrice: 285,
    items: [
      { partId: 'a1', storeId: 'seller-a', ownerId: 'owner-a', storeName: 'متجر أ', productName: 'فرامل', unitPrice: 100, quantity: 2, discount: 20, itemTotal: 180 },
      { partId: 'a2', storeId: 'seller-a', ownerId: 'owner-a', storeName: 'متجر أ', productName: 'فلتر', unitPrice: 50, quantity: 1, discount: 5, itemTotal: 45 },
    ],
  })
  assert.equal(drafts[1].couponCode, null)
  assert.equal(drafts[1].shippingFee, 60)
  assert.equal(drafts[1].totalPrice, 260)
})

test('keeps grouped-order rollout additive, idempotent, and stock-safe', () => {
  const migration = readFileSync(new URL('../prisma/grouped-orders.sql', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/orders/route.ts', import.meta.url), 'utf8')
  const disputes = readFileSync(new URL('../src/app/api/disputes/route.ts', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\."OrderItem"/)
  assert.match(migration, /where not exists/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\."OrderItem" from anon, authenticated/)
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i)
  assert.match(route, /clientOrderId: \{ startsWith: `\$\{checkoutId\}:` \}/)
  assert.match(route, /stock: \{ gte: item\.quantity \}/)
  assert.match(route, /stock: \{ decrement: item\.quantity \}/)
  assert.match(route, /نطاق الطلبات غير صالح/)
  assert.match(route, /code === 'P2002'/)
  assert.match(disputes, /status: \{ in: \['SHIPPED', 'DELIVERED'\] \}/)
  assert.match(disputes, /claimedOrder\.count !== 1/)
})

test('parses, validates, deduplicates, and serializes vehicle compatibility', () => {
  const parsed = parseVehicleCompatibility([
    { make: 'Toyota', model: 'Corolla', generation: 'E170', yearFrom: 2018, yearTo: 2022, engine: '1.6L' },
    { make: 'toyota', model: 'corolla', generation: 'e170', yearFrom: 2018, yearTo: 2022, engine: '1.6l' },
    { make: 'Honda', model: 'Civic', yearFrom: 2020 },
    { make: '', model: 'Invalid' },
  ])
  assert.equal(parsed.length, 2)
  assert.deepEqual(parsed[0], { make: 'Toyota', model: 'Corolla', generation: 'E170', yearFrom: 2018, yearTo: 2022, engine: '1.6L', trim: null, notes: null })
  assert.equal(serializeLegacyCompatibility(parsed), 'Toyota Corolla 2018-2022, Honda Civic 2020')
})

test('classifies structured vehicle fitment conservatively', () => {
  const part = { compatibilities: [{ make: 'Toyota', model: 'Corolla', generation: 'E170', yearFrom: 2014, yearTo: 2019, engine: '1.6L' }] }
  assert.equal(evaluateFitment(part, { brand: 'toyota', model: 'corolla', generation: 'e170', year: 2018, engine: '1.6l' }), 'fits')
  assert.equal(evaluateFitment(part, { brand: 'Toyota', model: 'Corolla', year: 2018 }), 'unknown')
  assert.equal(evaluateFitment(part, { brand: 'Toyota', model: 'Corolla', generation: 'E170', year: 2021, engine: '1.6L' }), 'does-not-fit')
  assert.equal(evaluateFitment(part, { brand: 'Honda', model: 'Civic', year: 2018 }), 'does-not-fit')
  assert.equal(evaluateFitment({ universal: true, compatibilities: [] }, null), 'fits')
  assert.equal(evaluateFitment({ compatibilities: [] }, { brand: 'Toyota', model: 'Corolla' }), 'unknown')
})

test('normalizes Arabic search and expands bounded automotive synonyms', () => {
  assert.equal(normalizeMarketplaceSearch('  مُحَرِّك   تَوْيُوتَا  '), 'محرك تويوتا')
  const variants = buildMarketplaceSearchQueries('BMW engin')
  assert.ok(variants.includes('bmw motor'))
  assert.ok(variants.includes('bmw engine'))
  assert.ok(variants.length <= 8)
  assert.ok(buildMarketplaceSearchQueries('bww').includes('bmw'), 'BMW typo should expand to the canonical brand')
  assert.ok(buildMarketplaceSearchQueries('بي إم').includes('bmw'), 'short Arabic BMW spelling should expand to the canonical brand')
  assert.ok(buildMarketplaceSearchQueries('mersedes').includes('mercedes'), 'common Mercedes typo should expand to the canonical brand')
  assert.ok(buildMarketplaceSearchQueries('mercedez engine').includes('mercedes engine'), 'multi-word typos should preserve the remaining terms')
  assert.equal(buildMarketplaceSearchQueries('x').length, 0)
})

test('normalizes valid Egyptian mobile formats and rejects invalid prefixes', () => {
  assert.equal(normalizeEgyptianMobile('+20 10 1234 5678'), '01012345678')
  assert.equal(normalizeEgyptianMobile('0020-11-1234-5678'), '01112345678')
  assert.equal(normalizeEgyptianMobile('1212345678'), '01212345678')
  assert.equal(normalizeEgyptianMobile('01312345678'), null)
  assert.equal(normalizeEgyptianMobile('0101234'), null)
})

test('normalizes known product conditions and never guesses unknown Schema.org states', () => {
  assert.equal(normalizeProductCondition('  import   new '), 'استيراد جديد')
  assert.equal(normalizeProductCondition('USED'), 'مستعمل')
  assert.equal(normalizeProductCondition(' استيراد اصلي '), 'استيراد اصلي')
  assert.equal(schemaConditionUrl('استيراد جديد'), 'https://schema.org/NewCondition')
  assert.equal(schemaConditionUrl('استيراد مستعمل'), 'https://schema.org/UsedCondition')
  assert.equal(schemaConditionUrl('مجدد'), 'https://schema.org/RefurbishedCondition')
  assert.equal(schemaConditionUrl('استيراد اصلي'), undefined)
})

test('canonicalizes common marketplace taxonomy aliases without touching custom values', () => {
  assert.equal(normalizeMarketplaceBrand('  bMw  '), 'BMW')
  assert.equal(normalizeMarketplaceBrand('Mercedes '), 'Mercedes')
  assert.equal(normalizeMarketplaceCategory(' car   engine '), 'محرك')
  assert.equal(normalizeMarketplaceCategory('جنوط'), 'جنط')
  assert.equal(normalizeMarketplaceCondition(' import   new '), 'استيراد جديد')
  assert.equal(normalizeMarketplaceBrand('علامة محلية خاصة'), 'علامة محلية خاصة')
})

test('renders escaped Arabic RTL transactional email markup', () => {
  const login = loginCodeEmailHtml({ name: '<محمد>', code: '1234' })
  const notification = notificationEmailHtml({ title: 'طلب جديد', message: '<script>alert(1)</script>', link: 'https://ghyarmarket-eg.com/orders?id=1&next=<script>' })
  assert.match(login, /dir="rtl"/)
  assert.match(login, /<table/)
  assert.ok(!login.includes('<محمد>'))
  assert.ok(!notification.includes('<script>'))
  assert.match(notification, /https:\/\/ghyarmarket-eg\.com\/orders/)
  assert.match(notification, /عرض التفاصيل في غيار ماركت/)
})

test('renders a safe one-time password reset email', () => {
  const html = passwordResetEmailHtml({ name: '<محمد>', resetUrl: 'https://ghyarmarket-eg.com/reset-password?token=a&next=<script>' })
  assert.match(html, /استعادة كلمة المرور/)
  assert.match(html, /https:\/\/ghyarmarket-eg\.com\/reset-password/)
  assert.ok(!html.includes('<محمد>'))
  assert.ok(!html.includes('<script>'))
})

test('requires email login codes for buyers and sellers but not admins', () => {
  assert.equal(requiresLoginCode('BUYER'), false)
  assert.equal(requiresLoginCode('SHOP_OWNER'), false)
  assert.equal(requiresLoginCode('ADMIN'), false)
})
