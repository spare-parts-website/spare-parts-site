import { calculateOrderLine } from './order-state.ts'
import { addMinor, fromMinorUnits, toMinorUnits } from './money.ts'

export type CheckoutPartSnapshot = {
  partId: string
  storeId: string
  ownerId: string
  storeName: string
  productName: string
  productImage?: string | null
  unitPrice: number
  quantity: number
}

export type CheckoutCouponSnapshot = {
  storeId: string
  code: string
  discountPercent: number
}

export type GroupedOrderDraft = {
  storeId: string
  ownerId: string
  storeName: string
  couponCode: string | null
  shippingFee: number
  totalQuantity: number
  discount: number
  itemsTotal: number
  totalPrice: number
  items: Array<CheckoutPartSnapshot & { discount: number; itemTotal: number }>
}

export function buildGroupedOrderDrafts(
  lines: CheckoutPartSnapshot[],
  shippingFee: number,
  coupon?: CheckoutCouponSnapshot | null,
): GroupedOrderDraft[] {
  const groups = new Map<string, CheckoutPartSnapshot[]>()
  for (const line of lines) {
    const group = groups.get(line.storeId) || []
    group.push(line)
    groups.set(line.storeId, group)
  }

  return Array.from(groups, ([storeId, group]) => {
    const appliesCoupon = coupon?.storeId === storeId ? coupon : null
    const items = group.map((line) => {
      const pricing = calculateOrderLine(line.unitPrice, line.quantity, appliesCoupon?.discountPercent || 0)
      return { ...line, discount: pricing.discount, itemTotal: pricing.total }
    })
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const discountMinor = addMinor(...items.map((item) => toMinorUnits(item.discount)))
    const itemsTotalMinor = addMinor(...items.map((item) => toMinorUnits(item.itemTotal)))
    const shippingFeeMinor = toMinorUnits(shippingFee)
    return {
      storeId,
      ownerId: items[0].ownerId,
      storeName: items[0].storeName,
      couponCode: appliesCoupon?.code || null,
      shippingFee: fromMinorUnits(shippingFeeMinor),
      totalQuantity,
      discount: fromMinorUnits(discountMinor),
      itemsTotal: fromMinorUnits(itemsTotalMinor),
      totalPrice: fromMinorUnits(addMinor(itemsTotalMinor, shippingFeeMinor)),
      items,
    }
  })
}
