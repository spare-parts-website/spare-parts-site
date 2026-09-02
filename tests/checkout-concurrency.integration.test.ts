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
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let buyerId = ''
  let ownerId = ''
  let storeId = ''
  let racePartId = ''
  let idempotentPartId = ''
  try {
    const uniqueConstraint = await db.$queryRaw<Array<{ exists: boolean }>>`select exists (select 1 from pg_indexes where indexname = 'Order_clientOrderId_key')`
    assert.equal(uniqueConstraint[0]?.exists, true)

    const owner = await db.user.create({ data: { name: `CI owner ${suffix}`, email: `ci-owner-${suffix}@example.invalid`, password: 'ci-only', role: 'SHOP_OWNER' } })
    const buyer = await db.user.create({ data: { name: `CI buyer ${suffix}`, email: `ci-buyer-${suffix}@example.invalid`, password: 'ci-only', role: 'BUYER', phone: '01012345678' } })
    ownerId = owner.id; buyerId = buyer.id
    const store = await db.store.create({ data: { name: `CI store ${suffix}`, ownerId: owner.id } })
    storeId = store.id
    const racePart = await db.part.create({ data: { name: `CI race part ${suffix}`, price: 100, stock: 2, storeId: store.id } })
    const idempotentPart = await db.part.create({ data: { name: `CI idempotent part ${suffix}`, price: 100, stock: 2, storeId: store.id } })
    racePartId = racePart.id; idempotentPartId = idempotentPart.id

    const createOrder = async (partId: string, clientOrderId: string) => db.$transaction(async (tx) => {
      const reserved = await tx.part.updateMany({ where: { id: partId, blocked: false, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } })
      if (reserved.count !== 1) return false
      await tx.order.create({
        data: {
          partId, storeId, buyerId, quantity: 1, totalPrice: 100, shippingFee: 0,
          deliveryAddress: 'CI-only', paymentMethod: 'cod', status: 'PENDING', paymentStatus: 'UNPAID', clientOrderId,
          items: { create: { partId, productName: 'CI part', unitPrice: 100, quantity: 1, discount: 0, itemTotal: 100 } },
          timeline: { create: { status: 'PENDING', note: 'CI-only' } },
        },
      })
      return true
    })

    // Five buyers racing for two units must produce exactly two committed
    // reservations; conditional stock updates prevent overselling.
    const raceResults = await Promise.all(Array.from({ length: 5 }, (_, index) => createOrder(racePart.id, `ci-race-${suffix}-${index}`)))
    assert.equal(raceResults.filter(Boolean).length, 2)
    assert.equal((await db.part.findUnique({ where: { id: racePart.id }, select: { stock: true } }))?.stock, 0)

    // Two requests with the same client id must converge to one order. A
    // unique constraint may abort one transaction; that is an expected winner
    // race, never a second order or a leaked stock decrement.
    const idempotencyKey = `ci-idempotent-${suffix}`
    const idempotentResults = await Promise.all(Array.from({ length: 2 }, async () => {
      try { return await createOrder(idempotentPart.id, idempotencyKey) }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002') return 'duplicate'
        throw error
      }
    }))
    assert.equal(idempotentResults.filter((value) => value === true).length, 1)
    assert.equal((await db.order.count({ where: { buyerId, clientOrderId: idempotencyKey } })), 1)
    assert.equal((await db.part.findUnique({ where: { id: idempotentPart.id }, select: { stock: true } }))?.stock, 1)
  } finally {
    if (buyerId) await db.order.deleteMany({ where: { buyerId } })
    if (racePartId) await db.part.deleteMany({ where: { id: { in: [racePartId, idempotentPartId] } } })
    if (storeId) await db.store.deleteMany({ where: { id: storeId } })
    if (buyerId || ownerId) await db.user.deleteMany({ where: { id: { in: [buyerId, ownerId].filter(Boolean) } } })
    await db.$disconnect()
  }
})
