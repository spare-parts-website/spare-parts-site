import type { AIAction, AIRole } from '@/lib/ai/types'

export const DEFAULT_AI_QUOTAS: Readonly<Record<AIRole, number>> = {
  GUEST: 10,
  BUYER: 40,
  SHOP_OWNER: 100,
  ADMIN: 150,
}

const ROLE_ACTIONS: Readonly<Record<AIRole, ReadonlySet<AIAction>>> = {
  GUEST: new Set(),
  BUYER: new Set(['cart_add', 'wishlist_store_add', 'wishlist_store_remove', 'order_action']),
  SHOP_OWNER: new Set(['cart_add', 'wishlist_store_add', 'wishlist_store_remove', 'order_action', 'seller_part_create', 'seller_part_update', 'seller_coupon_create']),
  ADMIN: new Set(['admin_part_block', 'admin_user_role', 'admin_store_verify', 'admin_report_decision', 'admin_verification_decision', 'admin_dispute_decision']),
}

export function roleCanPrepareAction(role: AIRole, action: AIAction) {
  return ROLE_ACTIONS[role].has(action)
}

export function maskEmail(value: string | null | undefined) {
  if (!value) return null
  const [name, domain] = value.split('@')
  if (!domain) return '***'
  return `${name.slice(0, 2)}***@${domain}`
}

export function maskPhone(value: string | null | undefined) {
  if (!value) return null
  return value.length <= 4 ? '****' : `${value.slice(0, 3)}****${value.slice(-2)}`
}
