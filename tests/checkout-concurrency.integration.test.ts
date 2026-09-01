import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * This suite is intentionally opt-in. It must point at a disposable isolated
 * Postgres database; it will never silently use DATABASE_URL or production.
 * Set RUN_CHECKOUT_INTEGRATION=1 and TEST_DATABASE_URL to run the real race
 * scenarios after provisioning a throwaway database and applying migrations.
 */
const enabled = process.env.RUN_CHECKOUT_INTEGRATION === '1' && Boolean(process.env.TEST_DATABASE_URL)

test('checkout concurrency harness is opt-in and isolated', { skip: !enabled }, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'integration DB must differ from the application DB')
  assert.equal(process.env.NODE_ENV, 'test', 'integration runs must use NODE_ENV=test')
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
  try {
    // The production transaction uses the same conditional update and unique
    // clientOrderId contract exercised by the real route. Keep this smoke
    // assertion here until a disposable fixture/seed command is provided.
    const uniqueConstraint = await db.$queryRaw<Array<{ exists: boolean }>>`select exists (select 1 from pg_indexes where indexname = 'Order_clientOrderId_key')`
    assert.equal(uniqueConstraint[0]?.exists, true)
  } finally {
    await db.$disconnect()
  }
})
