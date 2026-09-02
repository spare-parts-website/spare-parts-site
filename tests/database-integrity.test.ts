import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('database integrity migration is additive and covers marketplace invariants', () => {
  const migration = readFileSync(new URL('../prisma/data-integrity-constraints.sql', import.meta.url), 'utf8')
  for (const table of ['Part', 'Order', 'OrderItem', 'ProductReview', 'StoreReview', 'Coupon', 'VehicleCompatibility']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\.\\"${table}\\"`, 'i'))
  }
  for (const constraint of [
    'Part_price_positive_finite_chk',
    'Part_stock_nonnegative_chk',
    'Order_quantity_positive_chk',
    'Order_money_finite_nonnegative_chk',
    'OrderItem_quantity_positive_chk',
    'OrderItem_money_finite_nonnegative_chk',
    'ProductReview_ratings_range_chk',
    'StoreReview_rating_range_chk',
    'Coupon_usage_range_chk',
    'VehicleCompatibility_year_range_chk',
  ]) assert.match(migration, new RegExp(constraint))
  assert.match(migration, /NOT VALID/)
  assert.match(migration, /VALIDATE CONSTRAINT/)
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE)\b/i)
})

test('database integrity migration rejects NaN and infinity for floating money', () => {
  const migration = readFileSync(new URL('../prisma/data-integrity-constraints.sql', import.meta.url), 'utf8')
  assert.match(migration, /"price" = "price"/)
  assert.match(migration, /'Infinity'::double precision/)
  assert.match(migration, /"totalPrice" >= 0/)
  assert.match(migration, /"discountPercent" <= 100/)
})
