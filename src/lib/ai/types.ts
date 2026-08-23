import type { SessionUser } from '@/lib/auth'

export type AIRole = SessionUser['role'] | 'GUEST'

export type AIComplexity = 'quick' | 'standard' | 'heavy'

export type AIToolName =
  | 'searchMarketplace' | 'searchInternet' | 'navigate' | 'prepareDraft'
  | 'getAccountContext' | 'findCompatibleParts' | 'prepareAction'
  | 'getSellerInsights' | 'suggestSellerPrice' | 'getSellerWorkspace' | 'resolveSellerRecord'
  | 'getAdminInsights' | 'lookupAdminRecords'

export interface AIRequestPlan {
  complexity: AIComplexity
  intent: string
  tools: AIToolName[]
  forcedTool?: AIToolName
  liveSearch: boolean
  maxSteps: number
  timeoutMs: number
  maxOutputTokens: number
}

export const AI_ACTIONS = [
  'cart_add',
  'wishlist_store_add',
  'wishlist_store_remove',
  'car_create',
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
] as const

export type AIAction = (typeof AI_ACTIONS)[number]

export const AI_ENTITY_KINDS = ['part', 'store', 'car', 'order', 'user', 'report', 'verification', 'dispute', 'coupon', 'message'] as const
export type AIEntityKind = (typeof AI_ENTITY_KINDS)[number]

export interface AISelectedEntity {
  kind: AIEntityKind
  id: string
  label: string
}

export interface AIClientContext {
  cart: Array<{ partId: string; name: string; quantity: number; price: number }>
  selection?: AISelectedEntity
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
  model?: string
  year?: number
  engine?: string
  nickname?: string
  isPrimary?: boolean
}

export interface AIClientAction {
  type: 'navigate' | 'draft' | 'cart_add'
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
  }
}

export interface AIChatResponse {
  conversationId?: string
  answer: string
  cards: AIToolCard[]
  expiresAt?: string
}
