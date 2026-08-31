import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderLine, InvalidOrderTransition, resolveOrderTransition } from '../src/lib/order-state.ts'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '../src/lib/vehicle-compatibility.ts'
import { loginCodeEmailHtml, notificationEmailHtml, passwordResetEmailHtml } from '../src/lib/email-templates.ts'
import { requiresLoginCode } from '../src/lib/login-policy.ts'
import { buildGroupedOrderDrafts } from '../src/lib/grouped-orders.ts'
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
    { make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 },
    { make: 'toyota', model: 'corolla', yearFrom: 2018, yearTo: 2022 },
    { make: 'Honda', model: 'Civic', yearFrom: 2020 },
    { make: '', model: 'Invalid' },
  ])
  assert.equal(parsed.length, 2)
  assert.deepEqual(parsed[0], { make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 })
  assert.equal(serializeLegacyCompatibility(parsed), 'Toyota Corolla 2018-2022, Honda Civic 2020')
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
  assert.equal(requiresLoginCode('BUYER'), true)
  assert.equal(requiresLoginCode('SHOP_OWNER'), true)
  assert.equal(requiresLoginCode('ADMIN'), false)
})
