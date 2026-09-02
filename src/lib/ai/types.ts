import type { SessionUser } from '@/lib/auth'
import type { AIPageContext } from '@/lib/ai/context'

export type AIRole = SessionUser['role'] | 'GUEST'

export type AIComplexity = 'quick' | 'standard' | 'heavy'

export type AIToolName =
  | 'searchMarketplace' | 'compareMarketplace' | 'searchInternet' | 'navigate' | 'prepareDraft'
  | 'getAccountContext' | 'findCompatibleParts' | 'prepareAction' | 'getCheckoutPreview'
  | 'getSellerInsights' | 'suggestSellerPrice' | 'getSellerWorkspace' | 'resolveSellerRecord'
  | 'getAdminInsights' | 'lookupAdminRecords' | 'getSupportTickets' | 'getAdminSupportTickets'
  | 'getBuyerDisputes' | 'getSellerVerification' | 'getAdminReviews' | 'getAdminEmailDeliverability' | 'getAdminModeration'

/** Capability IDs are kept as strings here to avoid coupling the wire types to
 * the server registry module. The registry validates them before execution. */
export type AIPlannerMode = 'deterministic' | 'structured-agent'

export interface AIRequestPlan {
  complexity: AIComplexity
  intent: string
  tools: AIToolName[]
  forcedTool?: AIToolName
  liveSearch: boolean
  maxSteps: number
  timeoutMs: number
  maxOutputTokens: number
  plannerMode?: AIPlannerMode
  capabilities?: string[]
}

export const AI_ACTIONS = [
  'cart_add',
  'cart_update',
  'cart_remove',
  'cart_clear',
  'wishlist_store_add',
  'wishlist_store_remove',
  'order_action',
  'seller_part_create',
  'seller_part_update',
  'seller_coupon_create',
  'admin_part_block',
  'admin_user_role',
  'admin_store_verify',
  'admin_report_decision',
  'admin_verification_decision',
  'admin_dispute_decision',
  'buyer_message_send',
  'seller_message_send',
  'buyer_review_create',
  'buyer_dispute_create',
  'buyer_support_create',
  'buyer_support_reply',
  'admin_support_reply',
  'admin_part_create',
  'admin_part_update',
  'admin_store_update',
  'admin_user_update',
  'admin_review_moderate',
  'admin_support_status',
  'seller_store_update',
  'seller_coupon_update',
  'seller_fitment_update',
  'buyer_account_update',
  'seller_inventory_bulk_update',
  'buyer_report_create',
] as const

export type AIAction = (typeof AI_ACTIONS)[number]

export const AI_ENTITY_KINDS = ['part', 'store', 'order', 'user', 'report', 'verification', 'dispute', 'coupon', 'message', 'review', 'support_ticket'] as const
export type AIEntityKind = (typeof AI_ENTITY_KINDS)[number]

export interface AISelectedEntity {
  kind: AIEntityKind
  id: string
  label: string
}

export interface AIClientContext {
  cart: Array<{ partId: string; name: string; quantity: number; price: number }>
  selection?: AISelectedEntity
  page?: AIPageContext
  /** Server-derived follow-up search; never accepted directly from the client. */
  previousSearch?: string
  /** Server-derived entities recovered from prior result cards; never trusted from the client. */
  previousEntities?: AISelectedEntity[]
}

export interface AIProposalInput {
  action: AIAction
  targetId?: string
  name?: string
  entityName?: string
  storeName?: string
  partNumber?: string
  orderDescription?: string
  recency?: 'latest' | 'oldest'
  date?: string
  quantity?: number
  price?: number
  stock?: number
  description?: string
  category?: string
  condition?: string
  oemNumber?: string
  searchAliases?: string
  carModels?: string
  code?: string
  discountPercent?: number
  maxUses?: number
  expiresAt?: string
  status?: string
  role?: SessionUser['role']
  trackingNumber?: string
  brand?: string
  message?: string
  messageKind?: 'part' | 'order'
  subject?: string
  ticketCategory?: string
  reviewType?: 'product' | 'store'
  rating?: number
  sellerRating?: number
  packagingRating?: number
  deliveryRating?: number
  reason?: string
  disputeType?: 'RETURN' | 'WRONG_ITEM' | 'DAMAGED' | 'DELIVERY' | 'OTHER'
  targetType?: 'part' | 'store' | 'user'
  details?: string
  address?: string
  phone?: string
  avatar?: string
  verified?: boolean
  image?: string
  images?: string[]
  universal?: boolean
  fitmentNotes?: string
  email?: string
  emailNotifications?: boolean
  emailDeliveryStatus?: 'ACTIVE' | 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED'
  stockDelta?: number
  pricePercent?: number
  targetIds?: string[]
}

export interface AIClientAction {
  type: 'navigate' | 'draft' | 'cart_add' | 'cart_update' | 'cart_remove' | 'cart_clear'
  href?: string
  target?: string
  fields?: Record<string, string | number | boolean>
  cartItem?: {
    partId: string
    name: string
    price: number
    image?: string | null
    storeId: string
    storeName: string
    quantity: number
    stock: number
  }
  cartPartId?: string
  cartQuantity?: number
}

export interface AIToolCard {
  type: 'results' | 'insight' | 'navigation' | 'draft' | 'proposal'
  title: string
  description?: string
  items?: Array<{
    id: string
    title: string
    subtitle?: string
    href?: string
    value?: string | number
    select?: AISelectedEntity
  }>
  clientAction?: AIClientAction
  proposal?: {
    id: string
    action: AIAction
    summary: string
    expiresAt: string
    targetId?: string
    riskTier?: 2 | 3 | 4
    currentState?: string
    proposedState?: string
    consequences?: string
  }
}

export interface AIChatResponse {
  conversationId?: string
  answer: string
  cards: AIToolCard[]
  expiresAt?: string
}

/** Server-side, fail-closed response envelope used before UI streaming. */
export interface AIResponseGuardResult {
  answer: string
  cards: AIToolCard[]
  sources: Array<{ type: 'source-url'; sourceId: string; url: string; title?: string }>
  rejected: boolean
  reasons: string[]
}
