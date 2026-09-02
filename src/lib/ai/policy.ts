import type { AIAction, AIRole } from '@/lib/ai/types'
import { capabilityForAction, roleCanUseCapability, riskRequiresConfirmation, type AIRiskTier } from './capabilities.ts'

export const DEFAULT_AI_QUOTAS: Readonly<Record<AIRole, number>> = {
  GUEST: 10,
  BUYER: 40,
  SHOP_OWNER: 100,
  ADMIN: 150,
}

const ROLE_ACTIONS: Readonly<Record<AIRole, ReadonlySet<AIAction>>> = {
  GUEST: new Set(),
  BUYER: new Set(['cart_add', 'cart_update', 'cart_remove', 'cart_clear', 'wishlist_store_add', 'wishlist_store_remove', 'order_action', 'buyer_message_send', 'buyer_review_create', 'buyer_dispute_create', 'buyer_report_create', 'buyer_support_create', 'buyer_support_reply', 'buyer_account_update']),
  SHOP_OWNER: new Set(['cart_add', 'cart_update', 'cart_remove', 'cart_clear', 'wishlist_store_add', 'wishlist_store_remove', 'order_action', 'seller_part_create', 'seller_part_update', 'seller_inventory_bulk_update', 'seller_coupon_create', 'seller_coupon_update', 'seller_message_send', 'seller_store_update', 'seller_fitment_update', 'buyer_account_update', 'buyer_report_create', 'buyer_support_create', 'buyer_support_reply']),
  ADMIN: new Set(['wishlist_store_add', 'wishlist_store_remove', 'admin_part_block', 'admin_user_role', 'admin_store_verify', 'admin_report_decision', 'admin_verification_decision', 'admin_dispute_decision', 'admin_support_reply', 'admin_support_status', 'admin_part_create', 'admin_part_update', 'admin_store_update', 'admin_user_update', 'admin_review_moderate']),
}

export function roleCanPrepareAction(role: AIRole, action: AIAction) {
  return ROLE_ACTIONS[role].has(action) && (() => {
    const capability = capabilityForAction(action, role)
    return !capability || roleCanUseCapability(role, capability.id)
  })()
}

export function actionRiskTier(action: AIAction): AIRiskTier {
  return capabilityForAction(action)?.riskTier ?? 3
}

export function actionRequiresConfirmation(action: AIAction) {
  return riskRequiresConfirmation(actionRiskTier(action))
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
