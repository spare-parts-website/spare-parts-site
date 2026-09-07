import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { calculateOrderLine } from '../src/lib/order-state.ts'
import { toMinorUnits } from '../src/lib/money.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('money calculations round once in integer piastres', () => {
  assert.equal(toMinorUnits(19.99), 1999n)
  assert.deepEqual(calculateOrderLine(19.99, 3, 33.3333), {
    subtotal: 59.97,
    discount: 19.99,
    total: 39.98,
  })
  assert.deepEqual(calculateOrderLine(0.1, 3, 0), {
    subtotal: 0.3,
    discount: 0,
    total: 0.3,
  })
})

test('phase 4 migration persists exact minor units without breaking legacy API columns', () => {
  const migration = read('supabase/migrations/20260907020000_phase4_database_correctness.sql')
  assert.match(migration, /"priceMinor" bigint[\s\S]*GENERATED ALWAYS AS/)
  assert.match(migration, /"totalPriceMinor" bigint/)
  assert.match(migration, /"unitPriceMinor" bigint/)
  assert.match(migration, /Part_price_piastres_chk/)
  assert.match(migration, /Order_money_piastres_chk/)
  assert.match(migration, /OrderItem_money_piastres_chk/)
  assert.doesNotMatch(migration, /ALTER COLUMN "price" TYPE/)
})

test('workflow and fitment correctness are database enforced', () => {
  const migration = read('supabase/migrations/20260907020000_phase4_database_correctness.sql')
  assert.match(migration, /Report_status_chk/)
  assert.match(migration, /Dispute_status_chk/)
  assert.match(migration, /SellerVerification_status_chk/)
  assert.match(migration, /Report_one_open_target_per_reporter_key/)
  assert.match(migration, /WHERE "status" = 'OPEN'/)
  assert.match(migration, /VehicleCompatibility_normalized_identity_key/)
  assert.match(migration, /lower\(btrim\("make"\)\)/)
  assert.match(migration, /VehicleCompatibility_identity_text_chk/)
})

test('part moderation uses an explicit lifecycle with a safe legacy projection', () => {
  const schema = read('prisma/schema.prisma')
  const migration = read('supabase/migrations/20260908090000_part_moderation_lifecycle.sql')
  const adminParts = read('src/app/api/admin/parts/route.ts')
  const publicMarket = read('src/lib/public-marketplace.ts')

  assert.match(schema, /moderationStatus\s+String\s+@default\("ACTIVE"\)/)
  assert.match(schema, /moderatedBy\s+User\?\s+@relation\("PartModerator"/)
  assert.match(migration, /Part_moderationStatus_check/)
  assert.match(migration, /Part_moderation_projection/)
  assert.match(migration, /NEW\."moderationStatus" IS DISTINCT FROM OLD\."moderationStatus"/)
  assert.match(adminParts, /UNDER_REVIEW/)
  assert.match(adminParts, /moderatedById: session\.id/)
  assert.match(publicMarket, /moderationStatus: 'ACTIVE'/)
})

test('inventory and payment ledgers are append-only and database-authoritative', () => {
  const migration = read('supabase/migrations/20260907020000_phase4_database_correctness.sql')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\."InventoryLedger"/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\."PaymentLedger"/)
  assert.match(migration, /reject_marketplace_ledger_mutation/)
  assert.match(migration, /Part_inventory_ledger/)
  assert.match(migration, /AFTER UPDATE OF "stock" ON public\."Part"/)
  assert.match(migration, /Order_payment_ledger/)
  assert.match(migration, /AFTER UPDATE OF "paymentStatus" ON public\."Order"/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /FROM PUBLIC, anon, authenticated/)
})

test('maintenance drains protected-object deletions and expired database limits', () => {
  const cleanup = read('src/app/api/ai/cleanup/route.ts')
  assert.match(cleanup, /processObjectLifecycle/)
  assert.match(cleanup, /db\.rateLimitBucket\.deleteMany/)
  assert.match(cleanup, /24 \* 60 \* 60_000/)
})
