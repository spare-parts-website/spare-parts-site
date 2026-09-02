import { AI_ACTIONS, type AIAction, type AIRole, type AIToolName } from './types.ts'

/**
 * The registry is deliberately data-only. It is safe to expose to the
 * planner, but it never grants permission by itself. Every read/write still
 * goes through the canonical service/API and the server session checks.
 */
export type AIRiskTier = 0 | 1 | 2 | 3 | 4
export type AIDataMode = 'read' | 'write'
export type AIConfirmationPolicy = 'none' | 'standard' | 'strong' | 'excluded'
export type AIAuditPolicy = 'none' | 'required'

export const AI_CAPABILITY_IDS = [
  'marketplace.search', 'marketplace.compare', 'part.read', 'part.compatibility', 'store.read', 'web.research', 'navigation', 'draft.prepare', 'action.prepare',
  'buyer.cart.read', 'buyer.cart.add', 'buyer.cart.update', 'buyer.cart.remove', 'buyer.cart.clear', 'buyer.favorite.store.read', 'buyer.favorite.store.add', 'buyer.favorite.store.remove', 'buyer.order.list', 'buyer.order.read',
  'buyer.order.cancel', 'buyer.order.return', 'buyer.message.send', 'buyer.review.create', 'buyer.dispute.create', 'buyer.dispute.read', 'buyer.report.create',
  'buyer.support.create', 'buyer.support.read', 'buyer.support.reply', 'buyer.account.update', 'buyer.checkout.preview',
  'seller.inventory.list', 'seller.inventory.create', 'seller.inventory.update', 'seller.inventory.archive',
  'seller.inventory.bulkUpdate', 'seller.fitment.update', 'seller.coupon.create', 'seller.coupon.update',
  'seller.order.update', 'seller.message.read', 'seller.message.send', 'seller.analytics.read', 'seller.store.update', 'seller.reviews.read',
  'seller.verification.read', 'seller.verification.submit',
  'admin.users.read', 'admin.user.update', 'admin.parts.read', 'admin.part.createForSeller', 'admin.part.update',
  'admin.part.moderate', 'admin.stores.read', 'admin.store.update', 'admin.store.verify', 'admin.orders.read',
  'admin.reviews.read', 'admin.reviews.moderate', 'admin.reports.resolve', 'admin.disputes.resolve', 'admin.verification.resolve',
  'admin.support.read', 'admin.support.reply', 'admin.support.update', 'admin.analytics.read', 'admin.emailDelivery.read', 'admin.moderation.read',
  'infrastructure.shell', 'saved-car',
] as const

export type AICapabilityId = (typeof AI_CAPABILITY_IDS)[number]

export type AICapability = {
  id: AICapabilityId
  name: string
  rolesAllowed: readonly AIRole[]
  category: 'marketplace' | 'buyer' | 'seller' | 'admin' | 'shared' | 'excluded'
  riskTier: AIRiskTier
  readOrWrite: AIDataMode
  tool?: AIToolName
  action?: AIAction
  entityRequirements?: readonly string[]
  confirmationPolicy: AIConfirmationPolicy
  auditPolicy: AIAuditPolicy
  uiPresentation: 'answer' | 'result-card' | 'confirmation-card' | 'link'
  status: 'implemented' | 'partial' | 'planned' | 'excluded'
}

const EVERYONE: readonly AIRole[] = ['GUEST', 'BUYER', 'SHOP_OWNER', 'ADMIN']
const AUTHENTICATED: readonly AIRole[] = ['BUYER', 'SHOP_OWNER', 'ADMIN']
const BUYERS: readonly AIRole[] = ['BUYER', 'SHOP_OWNER']
const ACCOUNT_USERS: readonly AIRole[] = ['BUYER', 'SHOP_OWNER', 'ADMIN']
const FAVORITE_USERS: readonly AIRole[] = ['BUYER', 'SHOP_OWNER', 'ADMIN']

function read(id: AICapabilityId, name: string, rolesAllowed: readonly AIRole[], category: AICapability['category'], options: Pick<AICapability, 'tool' | 'entityRequirements' | 'uiPresentation' | 'status'>): AICapability {
  return { id, name, rolesAllowed, category, riskTier: 0, readOrWrite: 'read', confirmationPolicy: 'none', auditPolicy: 'none', ...options }
}

function write(id: AICapabilityId, name: string, rolesAllowed: readonly AIRole[], category: AICapability['category'], options: Pick<AICapability, 'riskTier' | 'status'> & Partial<Pick<AICapability, 'confirmationPolicy' | 'auditPolicy' | 'action' | 'entityRequirements' | 'uiPresentation'>>): AICapability {
  return { id, name, rolesAllowed, category, readOrWrite: 'write', confirmationPolicy: 'standard', auditPolicy: 'required', uiPresentation: 'confirmation-card', ...options }
}

export const AI_CAPABILITIES: readonly AICapability[] = [
  read('marketplace.search', 'البحث داخل غيار ماركت', EVERYONE, 'marketplace', { tool: 'searchMarketplace', uiPresentation: 'result-card', status: 'implemented' }),
  read('marketplace.compare', 'مقارنة عروض السوق', EVERYONE, 'marketplace', { tool: 'compareMarketplace', uiPresentation: 'result-card', status: 'implemented' }),
  read('part.read', 'قراءة تفاصيل قطعة عامة', EVERYONE, 'marketplace', { uiPresentation: 'result-card', status: 'implemented' }),
  read('part.compatibility', 'فحص توافق القطعة مع سيارة مكتوبة', EVERYONE, 'marketplace', { tool: 'findCompatibleParts', entityRequirements: ['make', 'model'], uiPresentation: 'result-card', status: 'partial' }),
  read('store.read', 'قراءة متجر عام', EVERYONE, 'marketplace', { uiPresentation: 'result-card', status: 'implemented' }),
  read('web.research', 'بحث ويب حديث مع مصادر', EVERYONE, 'shared', { tool: 'searchInternet', uiPresentation: 'result-card', status: 'partial' }),
  read('navigation', 'التنقل داخل الموقع', EVERYONE, 'shared', { tool: 'navigate', uiPresentation: 'link', status: 'implemented' }),
  read('draft.prepare', 'تجهيز مسودة محلية', AUTHENTICATED, 'shared', { tool: 'prepareDraft', uiPresentation: 'link', status: 'implemented' }),
  read('action.prepare', 'تجهيز اقتراح إجراء', AUTHENTICATED, 'shared', { tool: 'prepareAction', uiPresentation: 'confirmation-card', status: 'implemented' }),
  read('buyer.cart.read', 'قراءة السلة المحلية', ACCOUNT_USERS, 'buyer', { tool: 'getAccountContext', uiPresentation: 'result-card', status: 'implemented' }),
  write('buyer.cart.add', 'إضافة قطعة إلى السلة', BUYERS, 'buyer', { riskTier: 2, action: 'cart_add', entityRequirements: ['part'], status: 'implemented' }),
  write('buyer.cart.update', 'تعديل كمية في السلة', BUYERS, 'buyer', { riskTier: 2, action: 'cart_update', entityRequirements: ['part'], status: 'partial' }),
  write('buyer.cart.remove', 'إزالة قطعة من السلة', BUYERS, 'buyer', { riskTier: 2, action: 'cart_remove', entityRequirements: ['part'], status: 'partial' }),
  write('buyer.cart.clear', 'إفراغ السلة المحلية', BUYERS, 'buyer', { riskTier: 2, action: 'cart_clear', status: 'implemented' }),
  read('buyer.favorite.store.read', 'قراءة المتاجر المفضلة', FAVORITE_USERS, 'buyer', { tool: 'getAccountContext', uiPresentation: 'result-card', status: 'implemented' }),
  write('buyer.favorite.store.add', 'إضافة متجر إلى المفضلة', FAVORITE_USERS, 'buyer', { riskTier: 2, action: 'wishlist_store_add', entityRequirements: ['store'], status: 'implemented' }),
  write('buyer.favorite.store.remove', 'إزالة متجر من المفضلة', FAVORITE_USERS, 'buyer', { riskTier: 2, action: 'wishlist_store_remove', entityRequirements: ['store'], status: 'implemented' }),
  read('buyer.order.list', 'عرض طلبات المشتري', ['BUYER'], 'buyer', { tool: 'getAccountContext', uiPresentation: 'result-card', status: 'implemented' }),
  read('buyer.order.read', 'قراءة تفاصيل طلب المشتري', ['BUYER'], 'buyer', { tool: 'getAccountContext', entityRequirements: ['order'], uiPresentation: 'result-card', status: 'partial' }),
  write('buyer.order.cancel', 'إلغاء طلب المشتري', ['BUYER'], 'buyer', { riskTier: 3, action: 'order_action', entityRequirements: ['order'], status: 'implemented' }),
  write('buyer.order.return', 'إرجاع طلب المشتري', ['BUYER'], 'buyer', { riskTier: 3, action: 'order_action', entityRequirements: ['order'], status: 'partial' }),
  write('buyer.message.send', 'إرسال رسالة إلى متجر', ['BUYER'], 'buyer', { riskTier: 2, action: 'buyer_message_send', entityRequirements: ['part-or-order', 'message'], status: 'implemented' }),
  write('buyer.review.create', 'إنشاء أو تحديث تقييم', ['BUYER'], 'buyer', { riskTier: 2, action: 'buyer_review_create', entityRequirements: ['delivered-order', 'rating'], status: 'implemented' }),
  write('buyer.dispute.create', 'فتح نزاع على طلب', ['BUYER'], 'buyer', { riskTier: 3, action: 'buyer_dispute_create', entityRequirements: ['order', 'reason'], status: 'implemented' }),
  read('buyer.dispute.read', 'قراءة نزاعات المشتري', ['BUYER'], 'buyer', { tool: 'getBuyerDisputes', uiPresentation: 'result-card', status: 'implemented' }),
  write('buyer.report.create', 'إرسال بلاغ عن عنصر', ['BUYER', 'SHOP_OWNER'], 'buyer', { riskTier: 3, action: 'buyer_report_create', entityRequirements: ['part-or-store-or-user', 'reason'], status: 'implemented' }),
  write('buyer.support.create', 'فتح تذكرة دعم', BUYERS, 'buyer', { riskTier: 2, action: 'buyer_support_create', entityRequirements: ['subject', 'message'], status: 'implemented' }),
  read('buyer.support.read', 'قراءة تذاكر الدعم الخاصة', BUYERS, 'buyer', { tool: 'getSupportTickets', uiPresentation: 'result-card', status: 'implemented' }),
  write('buyer.support.reply', 'الرد على تذكرة الدعم الخاصة', BUYERS, 'buyer', { riskTier: 2, action: 'buyer_support_reply', entityRequirements: ['ticket', 'message'], status: 'implemented' }),
  write('buyer.account.update', 'تعديل بيانات الحساب الآمنة', BUYERS, 'buyer', { riskTier: 2, action: 'buyer_account_update', entityRequirements: ['profile-field'], status: 'implemented' }),
  read('buyer.checkout.preview', 'تجهيز ملخص إتمام الطلب', BUYERS, 'buyer', { tool: 'getCheckoutPreview', uiPresentation: 'result-card', status: 'partial' }),
  read('seller.inventory.list', 'عرض مخزون المتجر', ['SHOP_OWNER'], 'seller', { tool: 'getSellerWorkspace', uiPresentation: 'result-card', status: 'implemented' }),
  write('seller.inventory.create', 'إنشاء عرض جديد', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_part_create', entityRequirements: ['name', 'price', 'stock', 'condition'], status: 'implemented' }),
  write('seller.inventory.update', 'تعديل عرض المتجر', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_part_update', entityRequirements: ['part'], status: 'partial' }),
  write('seller.inventory.archive', 'أرشفة عرض', ['SHOP_OWNER'], 'seller', { riskTier: 4, confirmationPolicy: 'excluded', auditPolicy: 'required', status: 'excluded' }),
  write('seller.inventory.bulkUpdate', 'تعديل مخزون جماعي', ['SHOP_OWNER'], 'seller', { riskTier: 3, action: 'seller_inventory_bulk_update', entityRequirements: ['owned-parts'], status: 'implemented' }),
  write('seller.fitment.update', 'تعديل توافق العرض', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_fitment_update', entityRequirements: ['part', 'compatibility'], status: 'implemented' }),
  write('seller.coupon.create', 'إنشاء كوبون', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_coupon_create', status: 'implemented' }),
  write('seller.coupon.update', 'تعديل كوبون', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_coupon_update', entityRequirements: ['coupon'], status: 'implemented' }),
  write('seller.order.update', 'تحديث حالة طلب المتجر', ['SHOP_OWNER'], 'seller', { riskTier: 3, action: 'order_action', entityRequirements: ['owned-order'], status: 'implemented' }),
  read('seller.message.read', 'قراءة رسائل العملاء', ['SHOP_OWNER'], 'seller', { tool: 'getSellerWorkspace', uiPresentation: 'result-card', status: 'implemented' }),
  write('seller.message.send', 'إرسال رد للعميل', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_message_send', entityRequirements: ['owned-thread', 'message'], status: 'implemented' }),
  read('seller.analytics.read', 'قراءة تحليلات المتجر', ['SHOP_OWNER'], 'seller', { tool: 'getSellerInsights', uiPresentation: 'result-card', status: 'implemented' }),
  read('seller.reviews.read', 'قراءة تقييمات المتجر', ['SHOP_OWNER'], 'seller', { tool: 'getSellerWorkspace', uiPresentation: 'result-card', status: 'implemented' }),
  write('seller.store.update', 'تعديل بيانات المتجر', ['SHOP_OWNER'], 'seller', { riskTier: 2, action: 'seller_store_update', entityRequirements: ['owned-store'], status: 'implemented' }),
  read('seller.verification.read', 'قراءة حالة توثيق المتجر', ['SHOP_OWNER'], 'seller', { tool: 'getSellerVerification', uiPresentation: 'result-card', status: 'implemented' }),
  write('seller.verification.submit', 'إرسال طلب توثيق', ['SHOP_OWNER'], 'seller', { riskTier: 3, confirmationPolicy: 'excluded', entityRequirements: ['owned-store', 'private-documents'], status: 'excluded' }),
  read('admin.users.read', 'قراءة حسابات المستخدمين', ['ADMIN'], 'admin', { tool: 'lookupAdminRecords', uiPresentation: 'result-card', status: 'partial' }),
  write('admin.user.update', 'تعديل حساب مستخدم', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_user_update', entityRequirements: ['user'], status: 'implemented' }),
  read('admin.parts.read', 'قراءة عروض المنصة', ['ADMIN'], 'admin', { tool: 'lookupAdminRecords', uiPresentation: 'result-card', status: 'implemented' }),
  write('admin.part.createForSeller', 'إنشاء عرض نيابة عن بائع', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_part_create', entityRequirements: ['store', 'part'], status: 'implemented' }),
  write('admin.part.update', 'تعديل عرض نيابة عن بائع', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_part_update', entityRequirements: ['part'], status: 'implemented' }),
  write('admin.part.moderate', 'حظر أو إلغاء حظر عرض', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_part_block', entityRequirements: ['part'], status: 'implemented' }),
  read('admin.stores.read', 'قراءة المتاجر', ['ADMIN'], 'admin', { tool: 'lookupAdminRecords', uiPresentation: 'result-card', status: 'implemented' }),
  write('admin.store.update', 'تعديل متجر نيابة عن صاحبه', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_store_update', entityRequirements: ['store'], status: 'implemented' }),
  write('admin.store.verify', 'اعتماد أو إلغاء اعتماد متجر', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_store_verify', entityRequirements: ['store'], status: 'implemented' }),
  read('admin.orders.read', 'قراءة طلبات المنصة', ['ADMIN'], 'admin', { tool: 'lookupAdminRecords', uiPresentation: 'result-card', status: 'partial' }),
  read('admin.reviews.read', 'قراءة تقييمات المنصة', ['ADMIN'], 'admin', { tool: 'getAdminReviews', uiPresentation: 'result-card', status: 'implemented' }),
  write('admin.reviews.moderate', 'مراجعة تقييم', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_review_moderate', entityRequirements: ['review'], status: 'implemented' }),
  write('admin.reports.resolve', 'حسم بلاغ', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_report_decision', entityRequirements: ['report', 'decision'], status: 'implemented' }),
  write('admin.disputes.resolve', 'حسم نزاع', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_dispute_decision', entityRequirements: ['dispute', 'reason'], status: 'implemented' }),
  write('admin.verification.resolve', 'حسم طلب توثيق', ['ADMIN'], 'admin', { riskTier: 3, action: 'admin_verification_decision', entityRequirements: ['verification', 'decision'], status: 'implemented' }),
  read('admin.support.read', 'قراءة تذاكر الدعم', ['ADMIN'], 'admin', { tool: 'getAdminSupportTickets', uiPresentation: 'result-card', status: 'implemented' }),
  write('admin.support.reply', 'الرد على تذكرة دعم', ['ADMIN'], 'admin', { riskTier: 2, action: 'admin_support_reply', entityRequirements: ['ticket', 'message'], status: 'implemented' }),
  write('admin.support.update', 'تحديث حالة تذكرة دعم', ['ADMIN'], 'admin', { riskTier: 2, action: 'admin_support_status', entityRequirements: ['ticket', 'status'], status: 'implemented' }),
  read('admin.analytics.read', 'قراءة تحليلات الإدارة', ['ADMIN'], 'admin', { tool: 'getAdminInsights', uiPresentation: 'result-card', status: 'implemented' }),
  read('admin.emailDelivery.read', 'قراءة تسليم البريد', ['ADMIN'], 'admin', { tool: 'getAdminEmailDeliverability', uiPresentation: 'result-card', status: 'implemented' }),
  read('admin.moderation.read', 'قراءة مركز المراجعة', ['ADMIN'], 'admin', { tool: 'getAdminModeration', uiPresentation: 'result-card', status: 'implemented' }),
  { id: 'infrastructure.shell', name: 'أوامر البنية التحتية', rolesAllowed: [], category: 'excluded', riskTier: 4, readOrWrite: 'write', confirmationPolicy: 'excluded', auditPolicy: 'required', uiPresentation: 'answer', status: 'excluded' },
  { id: 'saved-car', name: 'السيارات المحفوظة القديمة', rolesAllowed: [], category: 'excluded', riskTier: 4, readOrWrite: 'read', confirmationPolicy: 'excluded', auditPolicy: 'none', uiPresentation: 'answer', status: 'excluded' },
] as const

export const CAPABILITY_REGISTRY: Readonly<Record<AICapabilityId, AICapability>> = Object.fromEntries(
  AI_CAPABILITIES.map((capability) => [capability.id, capability]),
) as Readonly<Record<AICapabilityId, AICapability>>

const TOOL_CAPABILITIES: Readonly<Partial<Record<AIToolName, AICapabilityId>>> = {
  searchMarketplace: 'marketplace.search', compareMarketplace: 'marketplace.compare', searchInternet: 'web.research', navigate: 'navigation', prepareDraft: 'draft.prepare', getCheckoutPreview: 'buyer.checkout.preview',
  getAccountContext: 'buyer.cart.read', findCompatibleParts: 'part.compatibility', prepareAction: 'action.prepare',
  getSellerInsights: 'seller.analytics.read', suggestSellerPrice: 'seller.inventory.update', getSellerWorkspace: 'seller.inventory.list', resolveSellerRecord: 'seller.message.read',
  getAdminInsights: 'admin.analytics.read', lookupAdminRecords: 'admin.users.read',
  getSupportTickets: 'buyer.support.read', getAdminSupportTickets: 'admin.support.read', getBuyerDisputes: 'buyer.dispute.read', getSellerVerification: 'seller.verification.read', getAdminReviews: 'admin.reviews.read', getAdminEmailDeliverability: 'admin.emailDelivery.read', getAdminModeration: 'admin.moderation.read',
}

export function getCapability(id: string) {
  return CAPABILITY_REGISTRY[id as AICapabilityId]
}

export function capabilityForTool(tool: AIToolName) {
  const id = TOOL_CAPABILITIES[tool]
  return id ? CAPABILITY_REGISTRY[id] : undefined
}

export function capabilityForAction(action: AIAction, role?: AIRole) {
  return AI_CAPABILITIES.find((capability) => capability.action === action && (!role || capability.rolesAllowed.includes(role)))
}

export function roleCanUseCapability(role: AIRole, id: string) {
  const capability = getCapability(id)
  return Boolean(capability && (capability.status === 'implemented' || capability.status === 'partial') && capability.rolesAllowed.includes(role))
}

export function capabilitiesForRole(role: AIRole) {
  return AI_CAPABILITIES.filter((capability) => (capability.status === 'implemented' || capability.status === 'partial') && capability.rolesAllowed.includes(role))
}

/** Server-side allowlist used after any model plan. */
export function allowedToolNamesForRole(role: AIRole): AIToolName[] {
  return [...new Set(Object.entries(TOOL_CAPABILITIES).flatMap(([tool, id]) => id && roleCanUseCapability(role, id) ? [tool as AIToolName] : []))]
}

export function riskRequiresConfirmation(riskTier: AIRiskTier) {
  return riskTier >= 2
}

export function isKnownAction(value: unknown): value is AIAction {
  return typeof value === 'string' && (AI_ACTIONS as readonly string[]).includes(value)
}
