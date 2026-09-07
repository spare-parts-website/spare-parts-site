import 'server-only'

import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { toMinorUnits } from '@/lib/money'

type Tx = Prisma.TransactionClient

type InventoryEvent = 'RESERVED' | 'RESTORED' | 'ADJUSTMENT' | 'IMPORT'
type PaymentEvent = 'PAID' | 'REFUNDED'

export async function recordInventoryMovement(tx: Tx, input: {
  partId: string
  orderId?: string | null
  orderItemId?: string | null
  actorId?: string | null
  eventType: InventoryEvent
  delta: number
  stockAfter: number
  idempotencyKey: string
  metadata?: Record<string, unknown> | null
}) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error('INVALID_INVENTORY_DELTA')
  if (!Number.isInteger(input.stockAfter) || input.stockAfter < 0) throw new Error('INVALID_STOCK_AFTER')
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null
  await tx.$executeRaw`
    INSERT INTO public."InventoryLedger" (
      "id", "partId", "orderId", "orderItemId", "actorId", "eventType",
      "delta", "stockAfter", "idempotencyKey", "metadata"
    ) VALUES (
      ${randomUUID()}, ${input.partId}, ${input.orderId ?? null}, ${input.orderItemId ?? null},
      ${input.actorId ?? null}, ${input.eventType}, ${input.delta}, ${input.stockAfter},
      ${input.idempotencyKey}, ${metadata}::jsonb
    )
    ON CONFLICT ("idempotencyKey") DO NOTHING
  `
}

export async function recordPaymentMovement(tx: Tx, input: {
  orderId: string
  actorId?: string | null
  eventType: PaymentEvent
  amount: number
  paymentMethod?: string | null
  idempotencyKey: string
  metadata?: Record<string, unknown> | null
}) {
  const amountMinor = toMinorUnits(input.amount)
  if (amountMinor < 0n) throw new Error('INVALID_PAYMENT_AMOUNT')
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null
  await tx.$executeRaw`
    INSERT INTO public."PaymentLedger" (
      "id", "orderId", "actorId", "eventType", "amountMinor", "currency",
      "paymentMethod", "paymentStatus", "idempotencyKey", "metadata"
    ) VALUES (
      ${randomUUID()}, ${input.orderId}, ${input.actorId ?? null}, ${input.eventType},
      ${amountMinor}, 'EGP', ${input.paymentMethod ?? null}, ${input.eventType},
      ${input.idempotencyKey}, ${metadata}::jsonb
    )
    ON CONFLICT ("idempotencyKey") DO NOTHING
  `
}
