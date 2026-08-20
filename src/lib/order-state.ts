export const ORDER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'DELIVERED', 'RETURNED', 'CANCELLED'] as const
export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED'] as const
export const ORDER_ACTIONS = ['approve', 'reject', 'pay', 'deliver', 'return', 'cancel'] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type OrderAction = (typeof ORDER_ACTIONS)[number]

export class InvalidOrderTransition extends Error {
  userMessage: string

  constructor(userMessage: string) {
    super('INVALID_ORDER_TRANSITION')
    this.userMessage = userMessage
  }
}

export function isOrderAction(value: unknown): value is OrderAction {
  return typeof value === 'string' && (ORDER_ACTIONS as readonly string[]).includes(value)
}

export function resolveOrderTransition(input: {
  action: OrderAction
  status: string
  paymentStatus: string
  paymentMethod: string | null
}) {
  const { action, status, paymentStatus, paymentMethod } = input

  if (action === 'approve' && status === 'PENDING') return { status: 'APPROVED' as const, paymentStatus, restoreStock: false }
  if (action === 'reject' && status === 'PENDING') return { status: 'REJECTED' as const, paymentStatus, restoreStock: true }
  if (action === 'pay') {
    if (status !== 'APPROVED') throw new InvalidOrderTransition('لا يمكن الدفع قبل موافقة المحل')
    if (paymentMethod === 'cod') throw new InvalidOrderTransition('هذا الطلب يُدفع عند الاستلام')
    return { status: 'PAID' as const, paymentStatus: 'PAID' as const, restoreStock: false }
  }
  if (action === 'deliver') {
    if (status !== 'PAID' && !(status === 'APPROVED' && paymentMethod === 'cod')) {
      throw new InvalidOrderTransition('لا يمكن تأكيد الاستلام قبل الموافقة على الطلب')
    }
    return { status: 'DELIVERED' as const, paymentStatus: paymentMethod === 'cod' ? 'PAID' as const : paymentStatus, restoreStock: false }
  }
  if (action === 'return') {
    if (status !== 'DELIVERED') throw new InvalidOrderTransition('لا يمكن الاسترجاع قبل التوصيل')
    return { status: 'RETURNED' as const, paymentStatus: 'REFUNDED' as const, restoreStock: true }
  }
  if (action === 'cancel') {
    if (!['PENDING', 'APPROVED'].includes(status) || paymentStatus !== 'UNPAID') {
      throw new InvalidOrderTransition('لا يمكن إلغاء هذا الطلب الآن')
    }
    return { status: 'CANCELLED' as const, paymentStatus, restoreStock: true }
  }
  throw new InvalidOrderTransition('لا يمكن تعديل هذا الطلب الآن')
}

export function calculateOrderLine(price: number, quantity: number, discountPercent = 0) {
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) throw new Error('INVALID_LINE')
  const safePercent = Number.isFinite(discountPercent) ? Math.min(100, Math.max(0, discountPercent)) : 0
  const subtotal = price * quantity
  const discount = Math.round(subtotal * safePercent) / 100
  return { subtotal, discount, total: Math.max(0, subtotal - discount) }
}
