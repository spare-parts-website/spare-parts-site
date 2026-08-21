import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderLine, InvalidOrderTransition, resolveOrderTransition } from '../src/lib/order-state.ts'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '../src/lib/vehicle-compatibility.ts'
import { loginCodeEmailHtml, notificationEmailHtml, passwordResetEmailHtml } from '../src/lib/email-templates.ts'

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
    resolveOrderTransition({ action: 'deliver', status: 'APPROVED', paymentStatus: 'UNPAID', paymentMethod: 'cod' }),
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
  const notification = notificationEmailHtml({ title: 'طلب جديد', message: '<script>alert(1)</script>' })
  assert.match(login, /dir="rtl"/)
  assert.match(login, /<table/)
  assert.ok(!login.includes('<محمد>'))
  assert.ok(!notification.includes('<script>'))
})

test('renders a safe one-time password reset email', () => {
  const html = passwordResetEmailHtml({ name: '<محمد>', resetUrl: 'https://ghyarmarket-eg.com/reset-password?token=a&next=<script>' })
  assert.match(html, /استعادة كلمة المرور/)
  assert.match(html, /https:\/\/ghyarmarket-eg\.com\/reset-password/)
  assert.ok(!html.includes('<محمد>'))
  assert.ok(!html.includes('<script>'))
})
