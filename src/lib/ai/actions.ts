import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { resolveOrderTransition, type OrderAction } from '@/lib/order-state'
import { parseVehicleCompatibility, serializeLegacyCompatibility } from '@/lib/vehicle-compatibility'
import { normalizeMarketplaceBrand, normalizeMarketplaceCategory, normalizeMarketplaceCondition } from '@/lib/marketplace-taxonomy'
import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { censorChatContent } from '@/lib/content-moderation'
import { sendSupportTicketEmail } from '@/lib/support-email'
import { isProfileAvatar } from '@/lib/profile-avatars'
import { deleteUploadedFiles } from '@/lib/storage'
import { AI_PROPOSAL_TTL_MS } from '@/lib/ai/runtime'
import { roleCanPrepareAction } from '@/lib/ai/policy'
import { capabilityForAction } from '@/lib/ai/capabilities'
import { resolveAdminEntity, resolveOrder, resolvePart, resolveSellerCoupon, resolveStore, resolveSupportTicket, type EntityResolution } from '@/lib/ai/resolver'
import type { AIClientAction, AIProposalInput, AISelectedEntity, AIToolCard } from '@/lib/ai/types'
import type { SessionUser } from '@/lib/auth'

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const UPLOAD_URL = /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/uploads\/[A-Za-z0-9._-]+$/

function validGallery(values: string[] | undefined) {
  return values === undefined || (values.length <= 4 && new Set(values).size === values.length && values.every((value) => UPLOAD_URL.test(value)))
}

function validAvatar(value: string | null | undefined) {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string') return false
  return value === '' || value.startsWith('https://') || Boolean(isProfileAvatar(value))
}

function validStoreImage(value: string | null | undefined) {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && value.length <= 500 && value.startsWith('https://')
}

function finite(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeStatus(action: AIProposalInput['action'], value: unknown) {
  const raw = cleanText(value, 50)
  if (!raw) return undefined
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '')
  const maps: Partial<Record<AIProposalInput['action'], Record<string, string>>> = {
    order_action: { الغاء: 'cancel', إلغاء: 'cancel', cancel: 'cancel', استلام: 'deliver', تسليم: 'deliver', deliver: 'deliver', ارجاع: 'return', إرجاع: 'return', return: 'return', موافقة: 'approve', قبول: 'approve', approve: 'approve', رفض: 'reject', reject: 'reject', شحن: 'ship', ship: 'ship' },
    admin_part_block: { حظر: 'BLOCKED', محظور: 'BLOCKED', block: 'BLOCKED', blocked: 'BLOCKED', تفعيل: 'ACTIVE', نشط: 'ACTIVE', active: 'ACTIVE', unblock: 'ACTIVE' },
    admin_store_verify: { اعتماد: 'VERIFIED', توثيق: 'VERIFIED', verified: 'VERIFIED', إلغاءاعتماد: 'UNVERIFIED', إلغاءتوثيق: 'UNVERIFIED', unverified: 'UNVERIFIED' },
    admin_report_decision: { مراجعة: 'REVIEWED', reviewed: 'REVIEWED', تجاهل: 'DISMISSED', رفض: 'DISMISSED', dismissed: 'DISMISSED', حظر: 'BLOCKED', blocked: 'BLOCKED' },
    admin_verification_decision: { قبول: 'APPROVED', اعتماد: 'APPROVED', approved: 'APPROVED', رفض: 'REJECTED', rejected: 'REJECTED' },
    admin_dispute_decision: { للمشتري: 'RESOLVED_BUYER', حسمالمشتري: 'RESOLVED_BUYER', resolvedbuyer: 'RESOLVED_BUYER', للبائع: 'RESOLVED_SELLER', حسمالبائع: 'RESOLVED_SELLER', resolvedseller: 'RESOLVED_SELLER', رفض: 'REJECTED', rejected: 'REJECTED' },
    admin_support_status: { افتح: 'OPEN', open: 'OPEN', فتح: 'OPEN', قيدالعمل: 'IN_PROGRESS', inprogress: 'IN_PROGRESS', بانتظارالعميل: 'WAITING_FOR_CUSTOMER', waitingforcustomer: 'WAITING_FOR_CUSTOMER', بانتظارالدعم: 'WAITING_FOR_SUPPORT', waitingforsupport: 'WAITING_FOR_SUPPORT', حل: 'RESOLVED', محلول: 'RESOLVED', تمالحل: 'RESOLVED', resolve: 'RESOLVED', resolved: 'RESOLVED', اقفل: 'CLOSED', اغلق: 'CLOSED', أغلق: 'CLOSED', مغلق: 'CLOSED', مغلقة: 'CLOSED', close: 'CLOSED', closed: 'CLOSED' },
  }
  return maps[action]?.[key] || raw
}

function humanDecision(value?: string) {
  const labels: Record<string, string> = {
    cancel: 'إلغاء الطلب', deliver: 'تأكيد الاستلام', return: 'طلب إرجاع', approve: 'الموافقة', reject: 'الرفض', ship: 'تأكيد الشحن',
    BLOCKED: 'الحظر', ACTIVE: 'إلغاء الحظر', VERIFIED: 'الاعتماد', UNVERIFIED: 'إلغاء الاعتماد', REVIEWED: 'تمت المراجعة', DISMISSED: 'رفض البلاغ', APPROVED: 'القبول', REJECTED: 'الرفض', RESOLVED_BUYER: 'الحسم لصالح المشتري', RESOLVED_SELLER: 'الحسم لصالح البائع',
    BUYER: 'مشتري', SHOP_OWNER: 'صاحب متجر', ADMIN: 'مدير',
    OPEN: 'مفتوحة', IN_PROGRESS: 'قيد العمل', WAITING_FOR_CUSTOMER: 'بانتظار العميل', WAITING_FOR_SUPPORT: 'بانتظار الدعم', RESOLVED: 'تم الحل', CLOSED: 'مغلقة',
  }
  return value ? labels[value] || value : ''
}

function normalizeInput(input: AIProposalInput): AIProposalInput {
  return {
    action: input.action,
    targetId: cleanText(input.targetId, 100) || undefined,
    name: cleanText(input.name, 160) || undefined,
    entityName: cleanText(input.entityName, 160) || undefined,
    storeName: cleanText(input.storeName, 160) || undefined,
    orderDescription: cleanText(input.orderDescription, 240) || undefined,
    recency: input.recency === 'oldest' ? 'oldest' : input.recency === 'latest' ? 'latest' : undefined,
    date: cleanText(input.date, 30) || undefined,
    quantity: finite(input.quantity),
    price: finite(input.price),
    stock: finite(input.stock),
    description: cleanText(input.description, 2000) || undefined,
    category: cleanText(input.category, 120) || undefined,
    condition: cleanText(input.condition, 120) || undefined,
    partNumber: cleanText(input.partNumber, 100) || undefined,
    oemNumber: cleanText(input.oemNumber, 100) || undefined,
    searchAliases: cleanText(input.searchAliases, 500) || undefined,
    carModels: cleanText(input.carModels, 1000) || undefined,
    code: cleanText(input.code, 40).toUpperCase() || undefined,
    discountPercent: finite(input.discountPercent),
    maxUses: finite(input.maxUses),
    expiresAt: cleanText(input.expiresAt, 50) || undefined,
    status: normalizeStatus(input.action, input.status),
    role: input.role,
    trackingNumber: cleanText(input.trackingNumber, 100) || undefined,
    brand: cleanText(input.brand, 80) || undefined,
    message: cleanText(input.message, 5000) || undefined,
    messageKind: input.messageKind === 'order' ? 'order' : input.messageKind === 'part' ? 'part' : undefined,
    subject: cleanText(input.subject, 160) || undefined,
    ticketCategory: cleanText(input.ticketCategory, 40).toUpperCase() || undefined,
    reviewType: input.reviewType === 'store' ? 'store' : input.reviewType === 'product' ? 'product' : undefined,
    rating: finite(input.rating),
    sellerRating: finite(input.sellerRating),
    packagingRating: finite(input.packagingRating),
    deliveryRating: finite(input.deliveryRating),
    reason: cleanText(input.reason, 2000) || undefined,
    disputeType: input.disputeType,
    targetType: input.targetType === 'part' || input.targetType === 'store' || input.targetType === 'user' ? input.targetType : undefined,
    details: cleanText(input.details, 1000) || undefined,
    address: cleanText(input.address, 300) || undefined,
    phone: cleanText(input.phone, 40) || undefined,
    avatar: cleanText(input.avatar, 500) || undefined,
    verified: typeof input.verified === 'boolean' ? input.verified : undefined,
    image: cleanText(input.image, 500) || undefined,
    images: Array.isArray(input.images) ? input.images.filter((value): value is string => typeof value === 'string').map((value) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 4) : undefined,
    universal: typeof input.universal === 'boolean' ? input.universal : undefined,
    fitmentNotes: cleanText(input.fitmentNotes, 1000) || undefined,
    email: cleanText(input.email, 254).toLowerCase() || undefined,
    emailNotifications: typeof input.emailNotifications === 'boolean' ? input.emailNotifications : undefined,
    emailDeliveryStatus: (() => { const value = cleanText(input.emailDeliveryStatus, 20).toUpperCase(); return ['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(value) ? value as NonNullable<AIProposalInput['emailDeliveryStatus']> : undefined })(),
    stockDelta: finite(input.stockDelta),
    pricePercent: finite(input.pricePercent),
    targetIds: Array.isArray(input.targetIds) ? input.targetIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim().slice(0, 100)).filter(Boolean).slice(0, 200) : undefined,
  }
}

export async function prepareActionProposal(input: {
  conversationId: string
  user: SessionUser
  proposal: AIProposalInput
  selection?: AISelectedEntity
}): Promise<AIToolCard> {
  const proposal = normalizeInput(input.proposal)
  if (!roleCanPrepareAction(input.user.role, proposal.action)) throw new Error('ACTION_FORBIDDEN')
  const missing = missingEssentialInput(proposal)
  if (missing) return missing
  const unresolved = await resolveProposalTarget(input.user, proposal, input.selection)
  if (unresolved) return unresolved
  const summary = await validateAndDescribe(input.user, proposal)
  const preview = await proposalPreview(input.user, proposal)
  const expiresAt = new Date(Date.now() + AI_PROPOSAL_TTL_MS)
  const created = await db.aIActionProposal.create({
    data: {
      conversationId: input.conversationId,
      userId: input.user.id,
      role: input.user.role,
      action: proposal.action,
      payload: JSON.stringify(proposal),
      summary,
      idempotencyKey: randomUUID(),
      expiresAt,
    },
  })
  await audit({ actorId: input.user.id, action: 'AI_PROPOSAL_CREATED', targetType: proposal.action, targetId: proposal.targetId, metadata: { proposalId: created.id } })
  return {
    type: 'proposal' as const,
    title: 'إجراء يحتاج موافقتك',
    description: 'راجع التفاصيل جيداً. لن يتم أي تغيير قبل الضغط على تأكيد.',
    proposal: { id: created.id, action: proposal.action, summary, expiresAt: expiresAt.toISOString(), targetId: proposal.targetId, riskTier: preview.riskTier, currentState: preview.currentState, proposedState: preview.proposedState, consequences: preview.consequences },
  }
}

async function proposalPreview(user: SessionUser, input: AIProposalInput) {
  const capability = capabilityForAction(input.action, user.role)
  const riskTier = (capability?.riskTier || 2) as 2 | 3 | 4
  let currentState = 'الحالة الحالية ستُعاد قراءتها عند التأكيد.'
  let proposedState = 'تنفيذ التغيير المقترح بعد نجاح فحص الصلاحية.'
  let consequences = riskTier >= 3 ? 'إجراء تشغيلي مهم؛ قد يتطلب مراجعة السجل بعد التنفيذ.' : 'يمكن مراجعة النتيجة من صفحة الحساب أو المتجر.'
  if (input.action === 'cart_add' && input.targetId) {
    const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true, stock: true, price: true } })
    if (part) { currentState = `${part.name}: المخزون ${part.stock} • السعر ${part.price.toLocaleString('ar-EG')} ج.م`; proposedState = `إضافة ${Math.floor(input.quantity || 1)} إلى السلة بالسعر الحالي بعد فحص المخزون.`; consequences = 'السلة محلية في هذا المتصفح ولا ينشئ هذا الاقتراح طلباً أو حجزاً.' }
  } else if (input.action === 'seller_part_update' && input.targetId) {
    const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
    const part = store ? await db.part.findFirst({ where: { id: input.targetId, storeId: store.id }, select: { name: true, price: true, stock: true, description: true } }) : null
    if (part) { const nextPrice = input.price !== undefined ? input.price : input.pricePercent !== undefined ? Math.max(1, Math.round(part.price * (1 + input.pricePercent / 100))) : undefined; const nextStock = input.stock !== undefined ? Math.floor(input.stock) : input.stockDelta !== undefined ? Math.max(0, part.stock + Math.floor(input.stockDelta)) : undefined; currentState = `${part.name}: السعر ${part.price.toLocaleString('ar-EG')} ج.م • المخزون ${part.stock}`; proposedState = `${nextPrice !== undefined ? `السعر ${nextPrice.toLocaleString('ar-EG')} ج.م` : ''}${nextStock !== undefined ? `${nextPrice !== undefined ? ' • ' : ''}المخزون ${nextStock}` : ''}${input.description ? ' • تحديث الوصف' : ''}`; consequences = 'سيظهر التعديل على العرض العام بعد الحفظ، ولا يغيّر الطلبات المكتملة.' }
  } else if (input.action === 'order_action' && input.targetId) {
    const order = await db.order.findUnique({ where: { id: input.targetId }, select: { status: true, paymentStatus: true } })
    if (order) { currentState = `حالة الطلب ${order.status} • الدفع ${order.paymentStatus}`; proposedState = `تطبيق: ${humanDecision(input.status)}`; consequences = 'قد يغيّر حالة الطلب ويعيد المخزون أو يحدّث الدفع وفق قواعد الطلب المعتمدة.' }
  } else if (input.action === 'admin_part_block' && input.targetId) {
    const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true, blocked: true } })
    if (part) { currentState = `${part.name}: ${part.blocked ? 'محظورة' : 'نشطة'}`; proposedState = input.status === 'BLOCKED' ? 'حظر العرض من السوق العام' : 'إلغاء حظر العرض'; consequences = 'يؤثر على الظهور العام فقط ولا يحذف بيانات العرض.' }
  } else if (input.action === 'admin_store_verify' && input.targetId) {
    const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true, verified: true } })
    if (store) { currentState = `${store.name}: ${store.verified ? 'معتمد' : 'غير معتمد'}`; proposedState = input.status === 'VERIFIED' ? 'اعتماد المتجر' : 'إلغاء الاعتماد'; consequences = 'سيظهر تغيير الاعتماد للمستخدمين وقد يؤثر على شارة الثقة.' }
  } else if (input.action === 'buyer_support_create') {
    currentState = 'لا توجد تذكرة جديدة محفوظة بعد.'
    proposedState = `فتح تذكرة «${input.subject || 'دعم غيار ماركت'}»${input.ticketCategory ? ` بتصنيف ${input.ticketCategory}` : ''}`
    consequences = 'سيصل إشعار لفريق الدعم، ويمكن متابعة الرد من صفحة الدعم.'
  } else if (input.action === 'buyer_dispute_create' && input.targetId) {
    const order = await db.order.findUnique({ where: { id: input.targetId }, select: { status: true } })
    if (order) { currentState = `حالة الطلب ${order.status}`; proposedState = `فتح نزاع ${input.disputeType || 'OTHER'} على الطلب`; consequences = 'سيُخطر المتجر وفريق الإدارة، ولا تُرفق أدلة خاصة من خلال المساعد.' }
  } else if ((input.action === 'buyer_message_send' || input.action === 'seller_message_send') && input.message) {
    currentState = 'لم تُرسل الرسالة بعد.'
    proposedState = `إرسال رسالة: «${input.message.slice(0, 120)}»`
    consequences = 'ستُحفظ الرسالة في محادثة القطعة أو الطلب ويصل إشعار للطرف الآخر.'
  } else if (input.action === 'admin_support_reply' && input.targetId) {
    currentState = 'التذكرة ستُعاد قراءتها عند التأكيد.'
    const safeMessage = censorChatContent(input.message || '').text
    proposedState = `إضافة رد دعم: «${safeMessage.slice(0, 120)}»`
    consequences = 'سيُخطر صاحب التذكرة ويتحول وضعها إلى انتظار العميل.'
  } else if (input.action === 'admin_support_status' && input.targetId) {
    const ticket = await db.supportTicket.findUnique({ where: { id: input.targetId }, select: { subject: true, status: true } })
    if (ticket) { currentState = `تذكرة «${ticket.subject}»: ${ticket.status}`; proposedState = `تغيير الحالة إلى ${humanDecision(input.status) || input.status}`; consequences = 'ستظهر الحالة الجديدة في مركز الدعم. لا يتم حذف التذكرة أو رسائلها.' }
  }
  return { riskTier, currentState, proposedState, consequences }
}

function missingEssentialInput(input: AIProposalInput): AIToolCard | null {
  const fields: Partial<Record<AIProposalInput['action'], Array<[boolean, string]>>> = {
    order_action: [[!input.status, 'الإجراء المطلوب للطلب']],
    seller_part_create: [[!input.name, 'اسم القطعة'], [input.price === undefined, 'السعر'], [input.stock === undefined, 'المخزون'], [!input.condition, 'الحالة (جديدة أو مستعملة)']],
    seller_part_update: [[input.price === undefined && input.stock === undefined && input.stockDelta === undefined && input.pricePercent === undefined && !input.description && !input.name && !input.category && !input.brand && !input.condition && !input.partNumber && !input.oemNumber && !input.searchAliases && input.carModels === undefined && input.universal === undefined && !input.fitmentNotes && !input.image && !input.images, 'التغيير المطلوب مثل السعر أو المخزون أو الوصف']],
    seller_coupon_create: [[!input.code, 'كود الكوبون'], [input.discountPercent === undefined, 'نسبة الخصم'], [input.maxUses === undefined, 'عدد مرات الاستخدام']],
    admin_part_block: [[!input.status, 'هل تريد الحظر أم إلغاء الحظر؟']],
    admin_user_role: [[!input.role, 'الدور الجديد للمستخدم']],
    admin_store_verify: [[!input.status, 'هل تريد اعتماد المتجر أم إلغاء اعتماده؟']],
    admin_report_decision: [[!input.status, 'قرار البلاغ']],
    admin_verification_decision: [[!input.status, 'قبول طلب التوثيق أو رفضه']],
    admin_dispute_decision: [[!input.status, 'قرار النزاع'], [!input.description, 'سبب القرار']],
    buyer_message_send: [[!input.message, 'نص الرسالة']],
    seller_message_send: [[!input.message, 'نص الرد']],
    buyer_review_create: [[!input.reviewType, 'نوع التقييم'], [input.rating === undefined, 'عدد النجوم'], [input.reviewType === 'product' && [input.sellerRating, input.packagingRating, input.deliveryRating].some((value) => value === undefined), 'تقييم البائع والتغليف والتوصيل (1-5 لكل واحد)']],
    buyer_dispute_create: [[!input.reason, 'سبب النزاع']],
    buyer_report_create: [[!input.targetType, 'العنصر الذي تريد الإبلاغ عنه'], [!input.reason, 'سبب البلاغ']],
    buyer_support_create: [[!input.subject, 'عنوان التذكرة'], [!input.message, 'رسالة التذكرة']],
    buyer_support_reply: [[!input.targetId, 'تذكرة الدعم'], [!input.message, 'نص الرد']],
    admin_support_reply: [[!input.targetId, 'تذكرة الدعم'], [!input.message, 'نص الرد']],
    admin_support_status: [[!input.targetId && !input.entityName, 'تذكرة الدعم'], [!input.status, 'الحالة الجديدة للتذكرة']],
    admin_part_create: [[!input.name, 'اسم القطعة'], [input.price === undefined, 'السعر'], [input.stock === undefined, 'المخزون'], [!input.condition, 'الحالة'], [!input.storeName && !input.targetId, 'متجر البائع']],
    admin_part_update: [[input.price === undefined && input.stock === undefined && !input.description && !input.name && !input.condition && !input.brand && !input.category && !input.image && !input.images, 'التغيير المطلوب']],
    admin_store_update: [[!input.name && !input.description && !input.address && !input.phone && !input.image && input.verified === undefined, 'التغيير المطلوب']],
    admin_user_update: [[!input.name && !input.phone && !input.avatar && !input.role && !input.email && input.emailNotifications === undefined && !input.emailDeliveryStatus, 'التغيير المطلوب']],
    admin_review_moderate: [[!input.status, 'حظر التقييم أو إلغاء حظره']],
    seller_store_update: [[!input.name && !input.description && !input.address && !input.phone && !input.image, 'التغيير المطلوب']],
    seller_coupon_update: [[!input.code && input.discountPercent === undefined && input.maxUses === undefined && input.expiresAt === undefined && input.status === undefined, 'التغيير المطلوب']],
    seller_fitment_update: [[input.carModels === undefined && input.fitmentNotes === undefined && input.universal === undefined, 'بيانات التوافق']],
    buyer_account_update: [[!input.name && !input.phone && !input.avatar, 'الاسم أو الصورة أو الهاتف الجديد']],
    seller_inventory_bulk_update: [[input.pricePercent === undefined && input.stockDelta === undefined, 'نسبة السعر أو مقدار المخزون']],
  }
  const missing = fields[input.action]?.filter(([needed]) => needed).map(([, label]) => label) || []
  if (!missing.length) return null
  return { type: 'insight', title: 'محتاج معلومة واحدة عشان أكمل', description: `اسأل المستخدم باختصار عن: ${missing[0]}. لا تطلب أي معرّف أو كود تقني.` }
}

async function resolveProposalTarget(user: SessionUser, proposal: AIProposalInput, selection?: AISelectedEntity): Promise<AIToolCard | null> {
  let resolution: EntityResolution | undefined
  if (proposal.action === 'cart_add' || proposal.action === 'cart_update' || proposal.action === 'cart_remove') resolution = await resolvePart({ user, scope: 'public', reference: proposal, selection, requireStock: proposal.action !== 'cart_remove' })
  if (proposal.action === 'wishlist_store_add' || proposal.action === 'wishlist_store_remove') resolution = await resolveStore(proposal, selection)
  if (proposal.action === 'order_action') resolution = await resolveOrder(user, proposal, selection)
  if (proposal.action === 'seller_part_update') resolution = await resolvePart({ user, scope: 'seller', reference: proposal, selection })
  if (proposal.action === 'admin_part_block') resolution = await resolvePart({ user, scope: 'admin', reference: proposal, selection })
  if (proposal.action === 'admin_user_role') resolution = await resolveAdminEntity('user', proposal, selection)
  if (proposal.action === 'admin_store_verify') resolution = await resolveStore(proposal, selection)
  if (proposal.action === 'admin_report_decision') resolution = await resolveAdminEntity('report', proposal, selection)
  if (proposal.action === 'admin_verification_decision') resolution = await resolveAdminEntity('verification', proposal, selection)
  if (proposal.action === 'admin_dispute_decision') resolution = await resolveAdminEntity('dispute', proposal, selection)
  if (proposal.action === 'buyer_message_send') resolution = proposal.messageKind === 'order'
    ? await resolveOrder(user, proposal, selection)
    : await resolvePart({ user, scope: 'public', reference: proposal, selection })
  if (proposal.action === 'seller_message_send') resolution = await resolveSellerMessageTarget(user, proposal, selection)
  if (proposal.action === 'buyer_review_create') resolution = proposal.reviewType === 'store'
    ? await resolveStore(proposal, selection)
    : await resolvePart({ user, scope: 'public', reference: proposal, selection })
  if (proposal.action === 'buyer_dispute_create') resolution = await resolveOrder(user, proposal, selection)
  if (proposal.action === 'buyer_report_create') {
    const targetKind = proposal.targetType || (selection?.kind === 'part' || selection?.kind === 'store' || selection?.kind === 'user' ? selection.kind : undefined)
    if (targetKind) proposal.targetType = targetKind
    if (targetKind === 'part') resolution = await resolvePart({ user, scope: 'public', reference: proposal, selection })
    else if (targetKind === 'store') resolution = await resolveStore(proposal, selection)
    else if (targetKind === 'user') resolution = await resolveAdminEntity('user', proposal, selection)
  }
  if (proposal.action === 'buyer_support_reply' && selection?.kind === 'support_ticket' && selection.id) proposal.targetId = proposal.targetId || selection.id
  if (proposal.action === 'admin_part_create') resolution = await resolveStore(proposal, selection?.kind === 'store' ? selection : undefined)
  if (proposal.action === 'admin_part_update') resolution = await resolvePart({ user, scope: 'admin', reference: proposal, selection: selection?.kind === 'part' ? selection : undefined })
  if (proposal.action === 'admin_store_update') resolution = await resolveStore(proposal, selection?.kind === 'store' ? selection : undefined)
  if (proposal.action === 'admin_user_update') resolution = await resolveAdminEntity('user', proposal, selection)
  if (proposal.action === 'admin_review_moderate' && selection?.id) proposal.targetId = selection.id
  if (proposal.action === 'admin_support_reply' && selection?.id) proposal.targetId = proposal.targetId || selection.id
  if (proposal.action === 'admin_support_status') {
    if (selection?.kind === 'support_ticket') proposal.targetId = proposal.targetId || selection.id
    if (!proposal.targetId) resolution = await resolveSupportTicket(proposal, selection)
  }
  if (proposal.action === 'seller_coupon_update') resolution = await resolveSellerCoupon(user, proposal.entityName || proposal.code, proposal.recency, selection)
  if (proposal.action === 'seller_fitment_update') resolution = await resolvePart({ user, scope: 'seller', reference: proposal, selection })
  if (proposal.action === 'seller_store_update') {
    const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true, name: true } })
    if (!store) return { type: 'results', title: 'لا يوجد متجر مرتبط', description: 'لا أستطيع تعديل متجر غير موجود.' }
    proposal.targetId = store.id
  }
  if (proposal.action === 'buyer_account_update') proposal.targetId = user.id
  if (!resolution) return null
  if (resolution.status !== 'resolved') return resolution.card
  proposal.targetId = resolution.entity.id
  return null
}

async function resolveSellerMessageTarget(user: SessionUser, proposal: AIProposalInput, selection?: AISelectedEntity): Promise<EntityResolution> {
  const selectedId = selection?.kind === 'message' ? selection.id : proposal.targetId
  const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
  if (!store) return { status: 'missing', card: { type: 'results', title: 'لا يوجد متجر مرتبط', description: 'لا أستطيع إرسال رد قبل ربط حسابك بمتجر.' } }
  const query = proposal.entityName?.trim()
  const messages = await db.productMessage.findMany({
    where: { ...(selectedId ? { id: selectedId } : {}), receiverId: user.id, part: { storeId: store.id }, ...(query && !selectedId ? { OR: [{ message: { contains: query, mode: 'insensitive' } }, { part: { name: { contains: query, mode: 'insensitive' } } }, { sender: { name: { contains: query, mode: 'insensitive' } } }] } : {}) },
    select: { id: true, message: true, part: { select: { name: true } }, sender: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: selectedId || !query ? 1 : 6,
  })
  if (messages.length === 1) {
    const message = messages[0]
    return { status: 'resolved', entity: { id: message.id, label: `${message.part.name} — ${message.sender.name}`, subtitle: message.message.slice(0, 140) } }
  }
  if (messages.length > 1) return { status: 'choices', card: { type: 'results', title: 'اختر رسالة العميل المقصودة', description: 'وجدت أكثر من رسالة مطابقة؛ اختر واحدة قبل الإرسال.', items: messages.map((message) => ({ id: `message-${message.id}`, title: `${message.part.name} — ${message.sender.name}`, subtitle: message.message.slice(0, 140), select: { kind: 'message' as const, id: message.id, label: `${message.part.name} — ${message.sender.name}` } })) } }
  return { status: 'missing', card: { type: 'results', title: 'لم أجد رسالة عميل', description: 'اختر رسالة واردة من مساحة الرسائل أو اذكر اسم العميل/القطعة ثم اطلب الرد.' } }
}

async function validateAndDescribe(user: SessionUser, input: AIProposalInput) {
  switch (input.action) {
    case 'cart_add':
    case 'cart_update':
    case 'cart_remove': {
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false }, select: { name: true, stock: true } })
      const quantity = Math.floor(input.quantity || 1)
      if (!part || (input.action !== 'cart_remove' && (quantity < 1 || quantity > part.stock))) throw new Error('INVALID_ACTION_INPUT')
      return input.action === 'cart_add' ? `إضافة ${quantity} × ${part.name} إلى السلة` : input.action === 'cart_update' ? `تعديل كمية ${part.name} في السلة إلى ${quantity}` : `إزالة ${part.name} من السلة`
    }
    case 'cart_clear':
      return 'إفراغ السلة المحلية الحالية'
    case 'wishlist_store_add':
    case 'wishlist_store_remove': {
      const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true } })
      if (!store) throw new Error('INVALID_ACTION_INPUT')
      return `${input.action.endsWith('add') ? 'إضافة' : 'إزالة'} متجر ${store.name} ${input.action.endsWith('add') ? 'إلى' : 'من'} المفضلة`
    }
    case 'order_action': {
      const order = await db.order.findUnique({ where: { id: input.targetId }, include: { part: { select: { name: true } }, store: { select: { ownerId: true } } } })
      if (!order || !input.status) throw new Error('INVALID_ACTION_INPUT')
      const buyerAllowed = ['cancel', 'deliver', 'return'].includes(input.status) && order.buyerId === user.id
      const sellerAllowed = ['approve', 'reject', 'ship'].includes(input.status) && order.store.ownerId === user.id
      if (!buyerAllowed && !sellerAllowed) throw new Error('ACTION_FORBIDDEN')
      resolveOrderTransition({ action: input.status as OrderAction, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod })
      return `${humanDecision(input.status)} لطلب ${order.part.name}`
    }
    case 'seller_part_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      const validPrice = input.price !== undefined && Number.isFinite(input.price) && input.price > 0 && input.price <= 100000000
      const validStock = input.stock !== undefined && Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000
      const imageValues = input.images || (input.image ? [input.image] : undefined)
      if (!store || !input.name || input.name.length < 2 || !input.condition || !validPrice || !validStock || !validGallery(imageValues)) throw new Error('INVALID_ACTION_INPUT')
      return `نشر قطعة ${input.name} بسعر ${input.price} ج.م ومخزون ${input.stock}${imageValues?.length ? ` مع ${imageValues.length} صورة` : ''}. راجع بيانات التوافق قبل التأكيد.`
    }
    case 'seller_part_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      const part = store ? await db.part.findFirst({ where: { id: input.targetId, storeId: store.id }, select: { name: true, price: true, stock: true } }) : null
      const validPrice = input.price === undefined || (Number.isFinite(input.price) && input.price > 0 && input.price <= 100000000)
      const validStock = input.stock === undefined || (Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000)
      const validPricePercent = input.pricePercent === undefined || (Number.isFinite(input.pricePercent) && input.pricePercent >= -100 && input.pricePercent <= 1000)
      const validStockDelta = input.stockDelta === undefined || (Number.isInteger(input.stockDelta) && Math.abs(input.stockDelta) <= 1000000)
      const nextPrice = part && input.pricePercent !== undefined ? Math.max(1, Math.round(part.price * (1 + input.pricePercent / 100))) : input.price
      const nextStock = part && input.stockDelta !== undefined ? Math.max(0, part.stock + input.stockDelta) : input.stock
      const imageValues = input.images || (input.image ? [input.image] : undefined)
      if (!validGallery(imageValues)) throw new Error('INVALID_ACTION_INPUT')
      if (!part || (!validPrice || !validStock || !validPricePercent || !validStockDelta) || (nextPrice !== undefined && (!Number.isFinite(nextPrice) || nextPrice < 1 || nextPrice > 100000000)) || (nextStock !== undefined && (!Number.isInteger(nextStock) || nextStock < 0 || nextStock > 1000000))) throw new Error('INVALID_ACTION_INPUT')
      return `تحديث ${part.name}${input.price !== undefined ? ` — السعر ${input.price} ج.م` : input.pricePercent !== undefined ? ` — السعر ${input.pricePercent > 0 ? 'زيادة' : 'تخفيض'} ${Math.abs(input.pricePercent)}%` : ''}${input.stock !== undefined ? ` — المخزون ${input.stock}` : input.stockDelta !== undefined ? ` — المخزون ${input.stockDelta > 0 ? 'زيادة' : 'نقص'} ${Math.abs(input.stockDelta)}` : ''}${input.name ? ' — الاسم' : ''}`
    }
    case 'seller_coupon_create': {
      if (!input.code || !/^[A-Z0-9_-]{3,40}$/.test(input.code) || !input.discountPercent || input.discountPercent <= 0 || input.discountPercent > 100 || !Number.isInteger(input.maxUses) || (input.maxUses || 0) < 1 || (input.maxUses || 0) > 100000) throw new Error('INVALID_ACTION_INPUT')
      if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt) <= new Date())) throw new Error('INVALID_ACTION_INPUT')
      if (await db.coupon.findUnique({ where: { code: input.code }, select: { id: true } })) throw new Error('COUPON_EXISTS')
      return `إنشاء كوبون ${input.code} بخصم ${input.discountPercent}% وحد استخدام ${input.maxUses}`
    }
    case 'buyer_message_send':
    case 'seller_message_send': {
      const rawMessage = input.message || ''
      const message = censorChatContent(rawMessage).text
      if (rawMessage.length < 2 || message.length < 2) throw new Error('INVALID_ACTION_INPUT')
      if (input.action === 'seller_message_send') {
        const original = await db.productMessage.findFirst({ where: { id: input.targetId, receiverId: user.id, part: { store: { ownerId: user.id } } }, select: { part: { select: { name: true } }, sender: { select: { name: true } } } })
        if (!original) throw new Error('ACTION_FORBIDDEN')
        return `إرسال رد إلى ${original.sender.name} بخصوص ${original.part.name}`
      }
      if (input.messageKind === 'order') {
        const order = await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id }, include: { part: { select: { name: true } } } })
        if (!order) throw new Error('ACTION_FORBIDDEN')
        return `إرسال رسالة إلى متجر الطلب بخصوص ${order.part.name}`
      }
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false }, include: { store: { select: { ownerId: true, name: true } } } })
      if (!part || part.store.ownerId === user.id) throw new Error('ACTION_FORBIDDEN')
      return `إرسال رسالة إلى ${part.store.name} بخصوص ${part.name}`
    }
    case 'buyer_review_create': {
      const rating = input.rating
      if (!input.reviewType || rating === undefined || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('INVALID_ACTION_INPUT')
      const dimensions = [input.sellerRating, input.packagingRating, input.deliveryRating]
      if (input.reviewType === 'product' && dimensions.some((value) => !Number.isInteger(value) || value! < 1 || value! > 5)) throw new Error('INVALID_ACTION_INPUT')
      const order = input.reviewType === 'product'
        ? await db.order.findFirst({ where: { buyerId: user.id, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId: input.targetId }, { items: { some: { partId: input.targetId } } }] }, include: { part: { select: { name: true } } } })
        : await db.order.findFirst({ where: { buyerId: user.id, storeId: input.targetId, status: { in: ['DELIVERED', 'RETURNED'] } }, include: { part: { select: { name: true } } } })
      if (!order) throw new Error('ACTION_FORBIDDEN')
      return `حفظ تقييم ${rating}/5 لـ${input.reviewType === 'product' ? order.part.name : 'المتجر'}`
    }
    case 'buyer_dispute_create': {
      const reason = input.reason || ''
      if (!input.targetId || !input.disputeType || reason.length < 10 || reason.length > 2000) throw new Error('INVALID_ACTION_INPUT')
      const order = await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id }, select: { status: true, part: { select: { name: true } } } })
      if (!order || !['SHIPPED', 'DELIVERED'].includes(order.status)) throw new Error('ACTION_FORBIDDEN')
      return `فتح نزاع ${input.disputeType} على طلب ${order.part.name}`
    }
    case 'buyer_report_create': {
      const targetType = input.targetType
      const reason = input.reason || ''
      if (!targetType || !['part', 'store', 'user'].includes(targetType) || !input.targetId || input.targetId === user.id || reason.length < 2 || reason.length > 100 || (input.details && input.details.length > 1000)) throw new Error('INVALID_ACTION_INPUT')
      const exists = targetType === 'part'
        ? await db.part.findUnique({ where: { id: input.targetId }, select: { id: true } })
        : targetType === 'store'
          ? await db.store.findUnique({ where: { id: input.targetId }, select: { id: true } })
          : await db.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
      if (!exists) throw new Error('INVALID_ACTION_INPUT')
      const open = await db.report.findFirst({ where: { reporterId: user.id, targetType, targetId: input.targetId, status: 'OPEN' }, select: { id: true } })
      if (open) throw new Error('REPORT_EXISTS')
      return `إرسال بلاغ عن ${targetType === 'part' ? 'قطعة' : targetType === 'store' ? 'متجر' : 'حساب'} بسبب «${reason}»`
    }
    case 'buyer_support_create': {
      const categories = new Set(['GENERAL', 'ORDER', 'ACCOUNT', 'SELLER', 'PAYMENT', 'REPORT', 'RETURN_REFUND', 'TECHNICAL', 'OTHER'])
      if (!input.subject || input.subject.length < 3 || !input.message || input.message.length < 2 || (input.ticketCategory && !categories.has(input.ticketCategory))) throw new Error('INVALID_ACTION_INPUT')
      if (input.targetId) {
        const order = await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id }, select: { id: true } })
        if (!order) throw new Error('ACTION_FORBIDDEN')
      }
      return `فتح تذكرة دعم: ${input.subject}`
    }
    case 'buyer_support_reply': {
      const rawMessage = input.message || ''
      const message = censorChatContent(rawMessage).text
      if (!input.targetId || rawMessage.length < 2 || message.length < 2) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findFirst({ where: { id: input.targetId, userId: user.id }, select: { subject: true } })
      if (!ticket) throw new Error('ACTION_FORBIDDEN')
      return `إرسال رد على تذكرة «${ticket.subject}»`
    }
    case 'admin_support_reply': {
      const rawMessage = input.message || ''
      const message = censorChatContent(rawMessage).text
      if (!input.targetId || rawMessage.length < 2 || message.length < 2) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findUnique({ where: { id: input.targetId }, select: { subject: true } })
      if (!ticket) throw new Error('INVALID_ACTION_INPUT')
      return `إرسال رد على تذكرة «${ticket.subject}»`
    }
    case 'admin_support_status': {
      const allowed = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED'])
      if (!input.targetId || !input.status || !allowed.has(input.status)) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findUnique({ where: { id: input.targetId }, select: { subject: true, status: true } })
      if (!ticket) throw new Error('INVALID_ACTION_INPUT')
      if (ticket.status === input.status) throw new Error('ACTION_STALE')
      return `تحديث حالة تذكرة «${ticket.subject}» من ${ticket.status} إلى ${input.status}`
    }
    case 'admin_part_create': {
      const store = await db.store.findFirst({ where: { id: input.targetId, owner: { role: 'SHOP_OWNER' } }, select: { name: true } })
      const validPrice = input.price !== undefined && Number.isFinite(input.price) && input.price > 0 && input.price <= 100000000
      const validStock = input.stock !== undefined && Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000
      const imageValues = input.images || (input.image ? [input.image] : undefined)
      if (!store || !input.name || input.name.length < 2 || !input.condition || !validPrice || !validStock || !validGallery(imageValues)) throw new Error('INVALID_ACTION_INPUT')
      return `إنشاء عرض ${input.name} في ${store.name} بسعر ${input.price} ج.م ومخزون ${input.stock}`
    }
    case 'admin_part_update': {
      const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true } })
      const validPrice = input.price === undefined || (Number.isFinite(input.price) && input.price > 0 && input.price <= 100000000)
      const validStock = input.stock === undefined || (Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 1000000)
      const imageValues = input.images || (input.image !== undefined ? [input.image] : undefined)
      if (!part || !validPrice || !validStock || !validGallery(imageValues)) throw new Error('INVALID_ACTION_INPUT')
      return `تعديل عرض ${part.name} نيابة عن بائعه`
    }
    case 'admin_store_update': {
      const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true } })
      if (!store || (input.name !== undefined && (input.name.length < 2 || input.name.length > 120)) || (input.description !== undefined && input.description.length > 2000) || (input.address !== undefined && input.address.length > 300) || (input.phone !== undefined && input.phone.length > 40) || !validStoreImage(input.image) || (input.verified !== undefined && typeof input.verified !== 'boolean')) throw new Error('INVALID_ACTION_INPUT')
      return `تعديل بيانات متجر ${store.name} نيابة عن صاحبه`
    }
    case 'admin_user_update': {
      const target = await db.user.findUnique({ where: { id: input.targetId }, select: { id: true, name: true, email: true, role: true, store: { select: { id: true } } } })
      if (!target || input.targetId === user.id || (input.role !== undefined && !['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(input.role))) throw new Error('INVALID_ACTION_INPUT')
      const nextName = input.name === undefined ? target.name : input.name
      const nextEmail = input.email === undefined ? target.email : input.email
      if (nextName.length < 2 || nextName.length > 100 || !/^\S+@\S+\.\S+$/.test(nextEmail) || nextEmail.length > 254) throw new Error('INVALID_ACTION_INPUT')
      if (input.emailDeliveryStatus !== undefined && !['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(input.emailDeliveryStatus)) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === 'ADMIN' && input.role !== undefined && input.role !== 'ADMIN' && await db.user.count({ where: { role: 'ADMIN' } }) <= 1) throw new Error('LAST_ADMIN')
      if (target.role === 'SHOP_OWNER' && input.role !== undefined && input.role !== 'SHOP_OWNER' && target.store) throw new Error('STORE_ROLE_CONFLICT')
      if (!validAvatar(input.avatar)) throw new Error('INVALID_ACTION_INPUT')
      if (nextEmail !== target.email) {
        const existing = await db.user.findUnique({ where: { email: nextEmail }, select: { id: true } })
        if (existing && existing.id !== target.id) throw new Error('EMAIL_EXISTS')
      }
      return `تعديل حساب ${target.name}`
    }
    case 'admin_review_moderate': {
      if (!input.targetId || !['BLOCKED', 'ACTIVE'].includes(input.status || '') || !input.reviewType) throw new Error('INVALID_ACTION_INPUT')
      const review = input.reviewType === 'product' ? await db.productReview.findUnique({ where: { id: input.targetId }, select: { id: true } }) : await db.storeReview.findUnique({ where: { id: input.targetId }, select: { id: true } })
      if (!review) throw new Error('INVALID_ACTION_INPUT')
      return `${input.status === 'BLOCKED' ? 'حظر' : 'إلغاء حظر'} التقييم`
    }
    case 'seller_store_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { name: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      if ((input.name !== undefined && (input.name.length < 2 || input.name.length > 120)) || (input.description !== undefined && input.description.length > 2000) || (input.address !== undefined && input.address.length > 300) || (input.phone !== undefined && input.phone.length > 40) || !validStoreImage(input.image)) throw new Error('INVALID_ACTION_INPUT')
      return `تعديل بيانات متجر ${store.name}`
    }
    case 'seller_coupon_update': {
      const coupon = await db.coupon.findFirst({ where: { id: input.targetId, store: { ownerId: user.id } }, select: { code: true } })
      if (!coupon) throw new Error('ACTION_FORBIDDEN')
      if (input.discountPercent !== undefined && (!Number.isFinite(input.discountPercent) || input.discountPercent <= 0 || input.discountPercent > 100)) throw new Error('INVALID_ACTION_INPUT')
      if (input.maxUses !== undefined && (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 100000)) throw new Error('INVALID_ACTION_INPUT')
      if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt) <= new Date())) throw new Error('INVALID_ACTION_INPUT')
      return `تعديل كوبون ${coupon.code}`
    }
    case 'seller_fitment_update': {
      const part = await db.part.findFirst({ where: { id: input.targetId, store: { ownerId: user.id } }, select: { name: true } })
      if (!part) throw new Error('ACTION_FORBIDDEN')
      if (input.carModels !== undefined && input.carModels.length > 1000) throw new Error('INVALID_ACTION_INPUT')
      return `تحديث توافق ${part.name} بعد مراجعة البيانات المدخلة`
    }
    case 'buyer_account_update': {
      if (user.role !== 'BUYER' && user.role !== 'SHOP_OWNER') throw new Error('ACTION_FORBIDDEN')
      if (input.name !== undefined && (input.name.length < 2 || input.name.length > 100)) throw new Error('INVALID_ACTION_INPUT')
      if (!validAvatar(input.avatar)) throw new Error('INVALID_ACTION_INPUT')
      if (input.phone !== undefined && input.phone && !normalizeEgyptianMobile(input.phone)) throw new Error('INVALID_ACTION_INPUT')
      return 'تعديل بيانات الحساب العامة (الاسم أو الصورة أو الهاتف)'
    }
    case 'seller_inventory_bulk_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true, name: true } })
      if (!store || (input.pricePercent === undefined && input.stockDelta === undefined)) throw new Error('INVALID_ACTION_INPUT')
      const where = input.targetIds?.length ? { id: { in: input.targetIds }, storeId: store.id } : { storeId: store.id, ...(input.entityName ? { OR: [{ name: { contains: input.entityName, mode: 'insensitive' as const } }, { brand: { contains: input.entityName, mode: 'insensitive' as const } }, { category: { contains: input.entityName, mode: 'insensitive' as const } }] } : {}) }
      const count = await db.part.count({ where })
      if (!count || count > 50) throw new Error('BULK_CAP_EXCEEDED')
      if (input.pricePercent !== undefined && (input.pricePercent < -100 || input.pricePercent > 1000)) throw new Error('INVALID_ACTION_INPUT')
      if (input.stockDelta !== undefined && (!Number.isInteger(input.stockDelta) || Math.abs(input.stockDelta) > 1000000)) throw new Error('INVALID_ACTION_INPUT')
      return `تعديل ${count} عروض في ${store.name}${input.pricePercent !== undefined ? ` بنسبة سعر ${input.pricePercent}%` : ''}${input.stockDelta !== undefined ? ` بمقدار مخزون ${input.stockDelta}` : ''}`
    }
    case 'admin_part_block': {
      const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true, blocked: true } })
      if (!part || !['BLOCKED', 'ACTIVE'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (part.blocked === (input.status === 'BLOCKED')) throw new Error('ACTION_STALE')
      return `${input.status === 'BLOCKED' ? 'حظر' : 'إلغاء حظر'} القطعة ${part.name}`
    }
    case 'admin_user_role': {
      const target = await db.user.findUnique({ where: { id: input.targetId }, select: { name: true, role: true } })
      if (!target || !input.role || input.targetId === user.id) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === input.role) throw new Error('ACTION_STALE')
      return `تغيير دور ${target.name} إلى ${humanDecision(input.role)}`
    }
    case 'admin_store_verify': {
      const store = await db.store.findUnique({ where: { id: input.targetId }, select: { name: true, verified: true } })
      if (!store || !['VERIFIED', 'UNVERIFIED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (store.verified === (input.status === 'VERIFIED')) throw new Error('ACTION_STALE')
      return `${input.status === 'VERIFIED' ? 'اعتماد' : 'إلغاء اعتماد'} متجر ${store.name}`
    }
    case 'admin_report_decision': {
      const report = await db.report.findUnique({ where: { id: input.targetId }, select: { id: true, status: true } })
      if (!report || !['REVIEWED', 'DISMISSED', 'BLOCKED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (report.status !== 'OPEN') throw new Error('ACTION_STALE')
      return `تحديث البلاغ: ${humanDecision(input.status)}`
    }
    case 'admin_verification_decision': {
      const verification = await db.sellerVerification.findUnique({ where: { id: input.targetId }, include: { store: { select: { name: true } } } })
      if (!verification || !['APPROVED', 'REJECTED'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      if (verification.status !== 'PENDING') throw new Error('ACTION_STALE')
      return `${input.status === 'APPROVED' ? 'اعتماد' : 'رفض'} طلب توثيق ${verification.store.name}`
    }
    case 'admin_dispute_decision': {
      const dispute = await db.dispute.findUnique({ where: { id: input.targetId }, include: { order: { include: { part: { select: { name: true } }, items: { select: { productName: true } } } } } })
      if (!dispute || !['RESOLVED_BUYER', 'RESOLVED_SELLER', 'REJECTED'].includes(input.status || '') || !input.description || input.description.length < 3) throw new Error('INVALID_ACTION_INPUT')
      if (dispute.status !== 'OPEN') throw new Error('ACTION_STALE')
      const label = dispute.order.items.length > 1 ? `${dispute.order.items[0].productName} و${dispute.order.items.length - 1} منتج آخر` : dispute.order.items[0]?.productName || dispute.order.part.name
      return `حسم نزاع ${label}: ${humanDecision(input.status)}`
    }
  }
  throw new Error('ACTION_NOT_IMPLEMENTED')
}

export async function decideActionProposal(input: { proposalId: string; user: SessionUser; approved: boolean }) {
  const proposal = await db.aIActionProposal.findFirst({ where: { id: input.proposalId, userId: input.user.id } })
  if (!proposal) throw new Error('PROPOSAL_NOT_FOUND')
  if (proposal.status !== 'PENDING') throw new Error('PROPOSAL_ALREADY_DECIDED')
  if (proposal.expiresAt <= new Date()) throw new Error('PROPOSAL_EXPIRED')
  if (proposal.role !== input.user.role) throw new Error('ACTION_FORBIDDEN')

  if (!input.approved) {
    const rejected = await db.aIActionProposal.updateMany({ where: { id: proposal.id, userId: input.user.id, status: 'PENDING' }, data: { status: 'REJECTED' } })
    if (rejected.count !== 1) throw new Error('PROPOSAL_ALREADY_DECIDED')
    await audit({ actorId: input.user.id, action: 'AI_ACTION_REJECTED', targetType: proposal.action, metadata: { proposalId: proposal.id } })
    return { ok: true, status: 'REJECTED' as const }
  }

  const claimed = await db.aIActionProposal.updateMany({
    where: { id: proposal.id, userId: input.user.id, role: input.user.role, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'PROCESSING' },
  })
  if (claimed.count !== 1) throw new Error('PROPOSAL_ALREADY_DECIDED')

  try {
    const payload = JSON.parse(proposal.payload) as AIProposalInput
    if (!roleCanPrepareAction(input.user.role, payload.action)) throw new Error('ACTION_FORBIDDEN')
    await validateAndDescribe(input.user, payload)
    const result = await executeAction(input.user, payload)
    await db.aIActionProposal.update({ where: { id: proposal.id }, data: { status: 'EXECUTED', executedAt: new Date() } })
    await audit({ actorId: input.user.id, action: 'AI_ACTION_EXECUTED', targetType: payload.action, targetId: payload.targetId, metadata: { proposalId: proposal.id } })
    return { ok: true, status: 'EXECUTED' as const, ...result }
  } catch (error) {
    await db.aIActionProposal.updateMany({ where: { id: proposal.id, status: 'PROCESSING' }, data: { status: 'FAILED', executedAt: new Date() } })
    await audit({ actorId: input.user.id, action: 'AI_ACTION_FAILED', targetType: proposal.action, metadata: { proposalId: proposal.id } }).catch(() => undefined)
    throw error
  }
}

async function executeAction(user: SessionUser, input: AIProposalInput): Promise<{ clientAction?: AIClientAction }> {
  switch (input.action) {
    case 'cart_add': {
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false, stock: { gt: 0 } }, include: { store: { select: { id: true, name: true } } } })
      if (!part) throw new Error('INVALID_ACTION_INPUT')
      return { clientAction: { type: 'cart_add', cartItem: { partId: part.id, name: part.name, price: part.price, image: part.image, storeId: part.store.id, storeName: part.store.name, quantity: Math.floor(input.quantity || 1), stock: part.stock } } }
    }
    case 'cart_update': {
      const quantity = Math.floor(input.quantity ?? 0)
      if (!input.targetId || !Number.isInteger(input.quantity) || quantity < 1) throw new Error('INVALID_ACTION_INPUT')
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false }, select: { stock: true } })
      if (!part || quantity > part.stock) throw new Error('INVALID_ACTION_INPUT')
      return { clientAction: { type: 'cart_update', cartPartId: input.targetId, cartQuantity: quantity } }
    }
    case 'cart_remove':
      if (!input.targetId) throw new Error('INVALID_ACTION_INPUT')
      return { clientAction: { type: 'cart_remove', cartPartId: input.targetId } }
    case 'cart_clear':
      return { clientAction: { type: 'cart_clear' } }
    case 'wishlist_store_add':
      await db.storeWishlist.upsert({ where: { userId_storeId: { userId: user.id, storeId: input.targetId! } }, update: {}, create: { userId: user.id, storeId: input.targetId! } })
      return {}
    case 'wishlist_store_remove':
      await db.storeWishlist.deleteMany({ where: { userId: user.id, storeId: input.targetId! } })
      return {}
    case 'seller_part_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      const current = await db.part.findFirst({ where: { id: input.targetId, storeId: store.id }, select: { id: true, price: true, stock: true } })
      if (!current) throw new Error('ACTION_FORBIDDEN')
      const nextPrice = input.price !== undefined ? input.price : input.pricePercent !== undefined ? Math.max(1, Math.round(current.price * (1 + input.pricePercent / 100))) : undefined
      const nextStock = input.stock !== undefined ? Math.floor(input.stock) : input.stockDelta !== undefined ? Math.max(0, current.stock + Math.floor(input.stockDelta)) : undefined
      if (nextPrice !== undefined && (!Number.isFinite(nextPrice) || nextPrice < 1 || nextPrice > 100000000) || nextStock !== undefined && (!Number.isInteger(nextStock) || nextStock < 0 || nextStock > 1000000)) throw new Error('INVALID_ACTION_INPUT')
      const gallery = input.images || (input.image !== undefined ? [input.image] : undefined)
      const compatibilityProvided = input.carModels !== undefined || input.universal !== undefined
      const compatibilities = compatibilityProvided && !input.universal ? parseVehicleCompatibility(input.carModels) : []
      await db.$transaction(async (tx) => {
        if (gallery) await tx.partImage.deleteMany({ where: { partId: current.id } })
        if (compatibilityProvided) await tx.vehicleCompatibility.deleteMany({ where: { partId: current.id } })
        await tx.part.update({ where: { id: current.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(nextPrice !== undefined ? { price: nextPrice } : {}), ...(nextStock !== undefined ? { stock: nextStock } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.category !== undefined ? { category: normalizeMarketplaceCategory(input.category) || null } : {}), ...(input.brand !== undefined ? { brand: normalizeMarketplaceBrand(input.brand) || null } : {}), ...(input.condition !== undefined ? { condition: normalizeMarketplaceCondition(input.condition) } : {}), ...(input.partNumber !== undefined ? { partNumber: input.partNumber || null } : {}), ...(input.oemNumber !== undefined ? { oemNumber: input.oemNumber || null } : {}), ...(input.searchAliases !== undefined ? { searchAliases: input.searchAliases || null } : {}), ...(input.universal !== undefined ? { universal: input.universal } : {}), ...(input.fitmentNotes !== undefined ? { fitmentNotes: input.fitmentNotes || null } : {}), ...(gallery ? { image: gallery[0] || null, images: gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined } : {}), ...(compatibilityProvided ? { carModels: input.universal ? null : serializeLegacyCompatibility(input.carModels), compatibilities: compatibilities.length ? { create: compatibilities } : undefined } : {}) } })
      })
      await audit({ actorId: user.id, action: 'SELLER_PART_UPDATED', targetType: 'part', targetId: current.id })
      return {}
    }
    case 'seller_part_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      const compatibilities = parseVehicleCompatibility(input.carModels)
      const gallery = input.images || (input.image ? [input.image] : [])
      const created = await db.part.create({ data: { storeId: store.id, name: input.name!, description: input.description || null, price: input.price!, stock: Math.floor(input.stock!), category: normalizeMarketplaceCategory(input.category) || null, brand: normalizeMarketplaceBrand(input.brand) || null, condition: normalizeMarketplaceCondition(input.condition), partNumber: input.partNumber || null, oemNumber: input.oemNumber || null, searchAliases: input.searchAliases || null, universal: Boolean(input.universal), fitmentNotes: input.fitmentNotes || null, image: gallery[0] || null, carModels: input.universal ? null : serializeLegacyCompatibility(input.carModels), images: gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined, compatibilities: input.universal ? undefined : compatibilities.length ? { create: compatibilities } : undefined } })
      await audit({ actorId: user.id, action: 'SELLER_PART_CREATED', targetType: 'part', targetId: created.id })
      return {}
    }
    case 'seller_coupon_create': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      await db.coupon.create({ data: { storeId: store.id, code: input.code!, discountPercent: input.discountPercent!, maxUses: input.maxUses!, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } })
      return {}
    }
    case 'buyer_message_send':
    case 'seller_message_send': {
      const rawMessage = input.message || ''
      const message = censorChatContent(rawMessage).text
      if (!message) throw new Error('INVALID_ACTION_INPUT')
      if (input.action === 'seller_message_send') {
        const original = await db.productMessage.findFirst({ where: { id: input.targetId, receiverId: user.id, part: { store: { ownerId: user.id } } }, select: { partId: true, senderId: true, part: { select: { name: true } } } })
        if (!original) throw new Error('ACTION_FORBIDDEN')
        const created = await db.productMessage.create({ data: { partId: original.partId, senderId: user.id, receiverId: original.senderId, message } })
        await createNotification({ userId: original.senderId, title: 'رد جديد من المتجر', message: `${user.name}: ${message}`.slice(0, 160), type: 'CHAT', link: 'inbox', dedupeKey: `chat-part/${created.id}/${original.senderId}` }).catch(() => undefined)
        return {}
      }
      if (input.messageKind === 'order') {
        const order = await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id }, select: { id: true, store: { select: { ownerId: true } } } })
        if (!order) throw new Error('ACTION_FORBIDDEN')
        const created = await db.chatMessage.create({ data: { orderId: order.id, senderId: user.id, receiverId: order.store.ownerId, message } })
        await createNotification({ userId: order.store.ownerId, title: 'رسالة جديدة', message: `${user.name}: ${message}`.slice(0, 160), type: 'CHAT', link: 'inbox', dedupeKey: `chat-order/${created.id}/${order.store.ownerId}` }).catch(() => undefined)
        return {}
      }
      const part = await db.part.findFirst({ where: { id: input.targetId, blocked: false }, select: { id: true, store: { select: { ownerId: true } } } })
      if (!part || part.store.ownerId === user.id) throw new Error('ACTION_FORBIDDEN')
      const created = await db.productMessage.create({ data: { partId: part.id, senderId: user.id, receiverId: part.store.ownerId, message } })
      await createNotification({ userId: part.store.ownerId, title: 'رسالة عن قطعة غيار', message: `${user.name}: ${message}`.slice(0, 160), type: 'CHAT', link: 'inbox', dedupeKey: `chat-part/${created.id}/${part.store.ownerId}` }).catch(() => undefined)
      return {}
    }
    case 'buyer_review_create': {
      if (!input.targetId || !input.reviewType || !input.rating) throw new Error('INVALID_ACTION_INPUT')
      const rating = Math.floor(input.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('INVALID_ACTION_INPUT')
      const comment = input.description || input.message || null
      if (input.reviewType === 'product') {
        const dimensions = [input.sellerRating, input.packagingRating, input.deliveryRating]
        if (dimensions.some((value) => !Number.isInteger(value) || value! < 1 || value! > 5)) throw new Error('INVALID_ACTION_INPUT')
        const order = await db.order.findFirst({ where: { buyerId: user.id, status: { in: ['DELIVERED', 'RETURNED'] }, OR: [{ partId: input.targetId }, { items: { some: { partId: input.targetId } } }] }, select: { id: true } })
        if (!order) throw new Error('ACTION_FORBIDDEN')
        const existing = await db.productReview.findFirst({ where: { userId: user.id, partId: input.targetId } })
        if (existing) await db.productReview.update({ where: { id: existing.id }, data: { rating, sellerRating: dimensions[0], packagingRating: dimensions[1], deliveryRating: dimensions[2], comment: comment?.trim() || null, orderId: order.id } })
        else await db.productReview.create({ data: { userId: user.id, partId: input.targetId, rating, sellerRating: dimensions[0], packagingRating: dimensions[1], deliveryRating: dimensions[2], comment: comment?.trim() || null, orderId: order.id } })
        const part = await db.part.findUnique({ where: { id: input.targetId }, select: { name: true, store: { select: { ownerId: true } } } })
        if (part) await createNotification({ userId: part.store.ownerId, title: 'تقييم جديد', message: `أضاف عميل تقييماً موثقاً لقطعة «${part.name}».`, type: 'REVIEW', link: 'shop-dashboard' }).catch(() => undefined)
      } else {
        const order = await db.order.findFirst({ where: { buyerId: user.id, storeId: input.targetId, status: { in: ['DELIVERED', 'RETURNED'] } }, select: { id: true } })
        if (!order) throw new Error('ACTION_FORBIDDEN')
        const existing = await db.storeReview.findFirst({ where: { userId: user.id, storeId: input.targetId } })
        if (existing) await db.storeReview.update({ where: { id: existing.id }, data: { rating, comment: comment?.trim() || null } })
        else await db.storeReview.create({ data: { userId: user.id, storeId: input.targetId, rating, comment: comment?.trim() || null } })
      }
      await audit({ actorId: user.id, action: 'AI_REVIEW_SAVED', targetType: input.reviewType, targetId: input.targetId })
      return {}
    }
    case 'buyer_dispute_create': {
      const reason = input.reason?.trim() || ''
      if (!input.targetId || !input.disputeType || reason.length < 10 || reason.length > 2000) throw new Error('INVALID_ACTION_INPUT')
      const order = await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id, status: { in: ['SHIPPED', 'DELIVERED'] } }, select: { id: true, storeId: true, store: { select: { ownerId: true } } } })
      if (!order) throw new Error('ACTION_FORBIDDEN')
      const dispute = await db.dispute.create({ data: { orderId: order.id, buyerId: user.id, storeId: order.storeId, type: input.disputeType, reason } })
      await Promise.allSettled([
        createNotification({ userId: order.store.ownerId, title: 'نزاع جديد على طلب', message: 'فتح العميل طلب حماية جديد. راجع تفاصيل الطلب.', type: 'DISPUTE', link: 'shop-dashboard', dedupeKey: `dispute-opened/${dispute.id}/${order.store.ownerId}` }),
        audit({ actorId: user.id, action: 'DISPUTE_OPENED', targetType: 'order', targetId: order.id }),
      ])
      return {}
    }
    case 'buyer_report_create': {
      const targetType = input.targetType
      const targetId = input.targetId
      const reason = censorChatContent(input.reason?.trim() || '').text
      const details = censorChatContent(input.details?.trim() || '').text
      if (!targetType || !targetId || targetId === user.id || !['part', 'store', 'user'].includes(targetType) || reason.length < 2 || reason.length > 100 || details.length > 1000) throw new Error('INVALID_ACTION_INPUT')
      const exists = targetType === 'part'
        ? await db.part.findUnique({ where: { id: targetId }, select: { id: true } })
        : targetType === 'store'
          ? await db.store.findUnique({ where: { id: targetId }, select: { id: true } })
          : await db.user.findUnique({ where: { id: targetId }, select: { id: true } })
      if (!exists) throw new Error('INVALID_ACTION_INPUT')
      const open = await db.report.findFirst({ where: { reporterId: user.id, targetType, targetId, status: 'OPEN' }, select: { id: true } })
      if (open) throw new Error('REPORT_EXISTS')
      const report = await db.report.create({ data: { reporterId: user.id, targetType, targetId, reason, details: details || null } })
      await audit({ actorId: user.id, action: 'AI_REPORT_CREATED', targetType, targetId, metadata: { reportId: report.id } })
      return {}
    }
    case 'buyer_support_create': {
      const categories = new Set(['GENERAL', 'ORDER', 'ACCOUNT', 'SELLER', 'PAYMENT', 'REPORT', 'RETURN_REFUND', 'TECHNICAL', 'OTHER'])
      const subject = input.subject?.trim() || ''
      const message = censorChatContent(input.message?.trim() || '').text
      const category = input.ticketCategory || 'GENERAL'
      if (subject.length < 3 || message.length < 2 || !categories.has(category)) throw new Error('INVALID_ACTION_INPUT')
      if (input.targetId && !(await db.order.findFirst({ where: { id: input.targetId, buyerId: user.id }, select: { id: true } }))) throw new Error('ACTION_FORBIDDEN')
      const ticket = await db.supportTicket.create({ data: { userId: user.id, orderId: input.targetId || null, category, subject, messages: { create: { authorId: user.id, authorRole: user.role, body: message } } }, select: { id: true } })
      await audit({ actorId: user.id, action: 'SUPPORT_TICKET_CREATED', targetType: 'support_ticket', targetId: ticket.id, metadata: { category } })
      const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      await Promise.allSettled(admins.map((admin) => createNotification({ userId: admin.id, title: 'تذكرة دعم جديدة', message: `${subject} — ${category}`, type: 'SUPPORT', link: `/admin/support?ticket=${encodeURIComponent(ticket.id)}`, dedupeKey: `support-ticket/${ticket.id}/${admin.id}` })))
      try {
        const delivery = await sendSupportTicketEmail({ ticketId: ticket.id, category, subject, message, userName: user.name, userEmail: user.email })
        await audit({ actorId: null, action: delivery.sent ? 'SUPPORT_EMAIL_SENT' : 'SUPPORT_EMAIL_SKIPPED', targetType: 'support_ticket', targetId: ticket.id, metadata: { reason: delivery.sent ? 'provider_accepted' : delivery.reason, providerId: delivery.sent ? delivery.providerId : undefined } })
      } catch (error) {
        await audit({ actorId: null, action: 'SUPPORT_EMAIL_FAILED', targetType: 'support_ticket', targetId: ticket.id, metadata: { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' } }).catch(() => undefined)
        console.error('AI support email failed', error instanceof Error ? error.message.slice(0, 300) : 'unknown error')
      }
      return {}
    }
    case 'buyer_support_reply': {
      const message = censorChatContent(input.message?.trim() || '').text
      if (!input.targetId || message.length < 2) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findFirst({ where: { id: input.targetId, userId: user.id }, select: { id: true, subject: true } })
      if (!ticket) throw new Error('ACTION_FORBIDDEN')
      const created = await db.$transaction(async (tx) => {
        await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: user.id, authorRole: user.role, body: message } })
        return tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'WAITING_FOR_SUPPORT' }, select: { id: true, updatedAt: true } })
      })
      const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      await Promise.allSettled([
        ...admins.map((admin) => createNotification({ userId: admin.id, title: 'رد جديد من العميل', message: `تمت إضافة رد على تذكرة: ${ticket.subject}`, type: 'SUPPORT', link: `/admin/support?ticket=${encodeURIComponent(ticket.id)}`, dedupeKey: `support-reply/${ticket.id}/${created.updatedAt.toISOString()}/${admin.id}` })),
        audit({ actorId: user.id, action: 'SUPPORT_TICKET_REPLIED_BY_USER', targetType: 'support_ticket', targetId: ticket.id }),
      ])
      return {}
    }
    case 'admin_support_reply': {
      const message = censorChatContent(input.message?.trim() || '').text
      if (!input.targetId || message.length < 2) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findUnique({ where: { id: input.targetId }, select: { id: true, userId: true, subject: true } })
      if (!ticket) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: user.id, authorRole: 'ADMIN', body: message } })
        await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'WAITING_FOR_CUSTOMER' } })
      })
      await Promise.allSettled([
        createNotification({ userId: ticket.userId, title: 'رد جديد من الدعم', message: `تمت إضافة رد على تذكرتك: ${ticket.subject}`, type: 'SUPPORT', link: `/support?ticket=${encodeURIComponent(ticket.id)}` }),
        audit({ actorId: user.id, action: 'SUPPORT_TICKET_REPLIED', targetType: 'support_ticket', targetId: ticket.id }),
      ])
      return {}
    }
    case 'admin_support_status': {
      const allowed = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_SUPPORT', 'RESOLVED', 'CLOSED'])
      if (!input.targetId || !input.status || !allowed.has(input.status)) throw new Error('INVALID_ACTION_INPUT')
      const ticket = await db.supportTicket.findUnique({ where: { id: input.targetId }, select: { id: true, userId: true, subject: true, status: true } })
      if (!ticket) throw new Error('INVALID_ACTION_INPUT')
      const updated = await db.supportTicket.updateMany({ where: { id: ticket.id, status: ticket.status }, data: { status: input.status } })
      if (updated.count !== 1) throw new Error('ACTION_STALE')
      await Promise.allSettled([
        createNotification({ userId: ticket.userId, title: 'تحديث حالة تذكرة الدعم', message: `تم تحديث حالة تذكرتك «${ticket.subject}» إلى ${input.status}.`, type: 'SUPPORT', link: `/support?ticket=${encodeURIComponent(ticket.id)}` }),
        audit({ actorId: user.id, action: 'SUPPORT_TICKET_STATUS_CHANGED', targetType: 'support_ticket', targetId: ticket.id, metadata: { from: ticket.status, to: input.status } }),
      ])
      return {}
    }
    case 'admin_part_create': {
      const store = await db.store.findFirst({ where: { id: input.targetId, owner: { role: 'SHOP_OWNER' } }, select: { id: true, ownerId: true } })
      if (!store || !input.name || input.price === undefined || input.stock === undefined || !input.condition) throw new Error('INVALID_ACTION_INPUT')
      const compatibilities = parseVehicleCompatibility(input.carModels)
      const gallery = input.images || (input.image ? [input.image] : [])
      if (!validGallery(gallery)) throw new Error('INVALID_ACTION_INPUT')
      const created = await db.part.create({ data: { storeId: store.id, name: input.name, description: input.description || null, price: input.price, stock: Math.floor(input.stock), category: normalizeMarketplaceCategory(input.category) || null, brand: normalizeMarketplaceBrand(input.brand) || null, condition: normalizeMarketplaceCondition(input.condition), partNumber: input.partNumber || null, oemNumber: input.oemNumber || null, searchAliases: input.searchAliases || null, universal: Boolean(input.universal), fitmentNotes: input.fitmentNotes || null, image: gallery[0] || null, images: gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined, carModels: input.universal ? null : serializeLegacyCompatibility(input.carModels), compatibilities: input.universal ? undefined : compatibilities.length ? { create: compatibilities } : undefined } })
      await audit({ actorId: user.id, action: 'ADMIN_PART_CREATED', targetType: 'part', targetId: created.id, metadata: { storeId: store.id, sellerId: store.ownerId, onBehalfOf: true } })
      return {}
    }
    case 'admin_part_update': {
      const current = await db.part.findUnique({ where: { id: input.targetId }, select: { storeId: true, store: { select: { ownerId: true } } } })
      if (!current) throw new Error('INVALID_ACTION_INPUT')
      const gallery = input.images || (input.image !== undefined ? [input.image] : undefined)
      if (!validGallery(gallery)) throw new Error('INVALID_ACTION_INPUT')
      const compatibilityProvided = input.carModels !== undefined || input.universal !== undefined
      const compatibilities = compatibilityProvided && !input.universal ? parseVehicleCompatibility(input.carModels) : []
      const updated = await db.$transaction(async (tx) => {
        if (compatibilityProvided) await tx.vehicleCompatibility.deleteMany({ where: { partId: input.targetId } })
        if (gallery) await tx.partImage.deleteMany({ where: { partId: input.targetId } })
        return tx.part.update({ where: { id: input.targetId }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.price !== undefined ? { price: input.price } : {}), ...(input.stock !== undefined ? { stock: Math.floor(input.stock) } : {}), ...(input.category !== undefined ? { category: normalizeMarketplaceCategory(input.category) || null } : {}), ...(input.brand !== undefined ? { brand: normalizeMarketplaceBrand(input.brand) || null } : {}), ...(input.condition !== undefined ? { condition: normalizeMarketplaceCondition(input.condition) } : {}), ...(input.partNumber !== undefined ? { partNumber: input.partNumber || null } : {}), ...(input.oemNumber !== undefined ? { oemNumber: input.oemNumber || null } : {}), ...(input.searchAliases !== undefined ? { searchAliases: input.searchAliases || null } : {}), ...(input.universal !== undefined ? { universal: input.universal } : {}), ...(input.fitmentNotes !== undefined ? { fitmentNotes: input.fitmentNotes || null } : {}), ...(gallery ? { image: gallery[0] || null, images: gallery.length > 1 ? { create: gallery.slice(1).map((url, index) => ({ url, position: index + 1 })) } : undefined } : {}), ...(compatibilityProvided ? { carModels: input.universal ? null : serializeLegacyCompatibility(input.carModels), compatibilities: compatibilities.length ? { create: compatibilities } : undefined } : {}) } })
      })
      await audit({ actorId: user.id, action: 'ADMIN_PART_UPDATED', targetType: 'part', targetId: updated.id, metadata: { storeId: current.storeId, sellerId: current.store.ownerId, onBehalfOf: true } })
      return {}
    }
    case 'admin_store_update': {
      const current = await db.store.findUnique({ where: { id: input.targetId }, select: { id: true, ownerId: true, image: true } })
      if (!current) throw new Error('INVALID_ACTION_INPUT')
      if ((input.name !== undefined && (input.name.length < 2 || input.name.length > 120)) || (input.description !== undefined && input.description.length > 2000) || (input.address !== undefined && input.address.length > 300) || (input.phone !== undefined && input.phone.length > 40) || !validStoreImage(input.image)) throw new Error('INVALID_ACTION_INPUT')
      await db.store.update({ where: { id: current.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.address !== undefined ? { address: input.address || null } : {}), ...(input.phone !== undefined ? { phone: input.phone || null } : {}), ...(input.image !== undefined ? { image: input.image || null } : {}), ...(input.verified !== undefined ? { verified: input.verified, verificationStatus: input.verified ? 'APPROVED' : 'UNVERIFIED', verifiedAt: input.verified ? new Date() : null } : {}) } })
      if (input.image !== undefined && input.image !== current.image) await deleteUploadedFiles([current.image])
      await audit({ actorId: user.id, action: 'ADMIN_STORE_UPDATED', targetType: 'store', targetId: current.id, metadata: { sellerId: current.ownerId, onBehalfOf: true } })
      return {}
    }
    case 'admin_user_update': {
      if (!input.targetId || input.targetId === user.id) throw new Error('ACTION_FORBIDDEN')
      const target = await db.user.findUnique({ where: { id: input.targetId }, select: { id: true, role: true, name: true, email: true, emailNotifications: true, emailDeliveryStatus: true, emailDeliveryReason: true, emailDeliveryAt: true, store: { select: { id: true } } } })
      if (!target) throw new Error('INVALID_ACTION_INPUT')
      const nextName = input.name === undefined ? target.name : input.name
      const nextEmail = input.email === undefined ? target.email : input.email
      const nextRole = input.role === undefined ? target.role : input.role
      const emailChanged = nextEmail !== target.email
      if (nextName.length < 2 || nextName.length > 100 || !/^\S+@\S+\.\S+$/.test(nextEmail) || nextEmail.length > 254 || !['BUYER', 'SHOP_OWNER', 'ADMIN'].includes(nextRole)) throw new Error('INVALID_ACTION_INPUT')
      if (!validAvatar(input.avatar)) throw new Error('INVALID_ACTION_INPUT')
      if (input.emailNotifications !== undefined && typeof input.emailNotifications !== 'boolean') throw new Error('INVALID_ACTION_INPUT')
      const nextDeliveryStatus = input.emailDeliveryStatus === undefined ? target.emailDeliveryStatus : input.emailDeliveryStatus
      if (!['ACTIVE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(nextDeliveryStatus)) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === 'ADMIN' && nextRole !== 'ADMIN' && await db.user.count({ where: { role: 'ADMIN' } }) <= 1) throw new Error('LAST_ADMIN')
      if (target.role === 'SHOP_OWNER' && nextRole !== 'SHOP_OWNER' && target.store) throw new Error('STORE_ROLE_CONFLICT')
      if (emailChanged) {
        const existing = await db.user.findUnique({ where: { email: nextEmail }, select: { id: true } })
        if (existing && existing.id !== target.id) throw new Error('EMAIL_EXISTS')
      }
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { name: nextName, email: nextEmail, ...(input.phone !== undefined ? { phone: input.phone || null } : {}), ...(input.avatar !== undefined ? { avatar: input.avatar || null } : {}), role: nextRole, ...(input.emailNotifications !== undefined ? { emailNotifications: input.emailNotifications } : {}), emailDeliveryStatus: emailChanged ? 'ACTIVE' : nextDeliveryStatus, emailDeliveryReason: emailChanged || nextDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryReason, emailDeliveryAt: emailChanged || nextDeliveryStatus === 'ACTIVE' ? null : target.emailDeliveryAt } })
        if (nextRole === 'SHOP_OWNER' && !target.store) await tx.store.create({ data: { name: `متجر ${nextName}`, description: '', ownerId: target.id } })
      })
      await audit({ actorId: user.id, action: 'ADMIN_USER_UPDATED', targetType: 'user', targetId: target.id, metadata: { onBehalfOf: true, roleChanged: nextRole !== target.role, emailChanged, emailDeliveryStatus: emailChanged ? 'ACTIVE' : nextDeliveryStatus } })
      return {}
    }
    case 'admin_review_moderate': {
      if (!input.targetId || !input.reviewType || !['BLOCKED', 'ACTIVE'].includes(input.status || '')) throw new Error('INVALID_ACTION_INPUT')
      const blocked = input.status === 'BLOCKED'
      if (input.reviewType === 'product') await db.productReview.update({ where: { id: input.targetId }, data: { blocked } })
      else await db.storeReview.update({ where: { id: input.targetId }, data: { blocked } })
      await audit({ actorId: user.id, action: blocked ? 'ADMIN_REVIEW_BLOCKED' : 'ADMIN_REVIEW_UNBLOCKED', targetType: input.reviewType, targetId: input.targetId })
      return {}
    }
    case 'seller_store_update': {
      const store = await db.store.findFirst({ where: { id: input.targetId, ownerId: user.id }, select: { id: true, name: true, image: true } })
      if (!store) throw new Error('ACTION_FORBIDDEN')
      if ((input.name !== undefined && (input.name.length < 2 || input.name.length > 120)) || (input.description !== undefined && input.description.length > 2000) || (input.address !== undefined && input.address.length > 300) || (input.phone !== undefined && input.phone.length > 40) || !validStoreImage(input.image)) throw new Error('INVALID_ACTION_INPUT')
      await db.store.update({ where: { id: store.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.address !== undefined ? { address: input.address || null } : {}), ...(input.phone !== undefined ? { phone: input.phone || null } : {}), ...(input.image !== undefined ? { image: input.image || null } : {}) } })
      if (input.image !== undefined && input.image !== store.image) await deleteUploadedFiles([store.image])
      await audit({ actorId: user.id, action: 'SELLER_STORE_UPDATED', targetType: 'store', targetId: store.id })
      return {}
    }
    case 'seller_coupon_update': {
      const coupon = await db.coupon.findFirst({ where: { id: input.targetId, store: { ownerId: user.id } }, select: { id: true } })
      if (!coupon) throw new Error('ACTION_FORBIDDEN')
      await db.coupon.update({ where: { id: coupon.id }, data: { ...(input.code !== undefined ? { code: input.code } : {}), ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}), ...(input.maxUses !== undefined ? { maxUses: Math.floor(input.maxUses) } : {}), ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}), ...(input.status !== undefined ? { active: input.status === 'ACTIVE' } : {}) } })
      await audit({ actorId: user.id, action: 'SELLER_COUPON_UPDATED', targetType: 'coupon', targetId: coupon.id })
      return {}
    }
    case 'seller_fitment_update': {
      const part = await db.part.findFirst({ where: { id: input.targetId, store: { ownerId: user.id } }, select: { id: true } })
      if (!part) throw new Error('ACTION_FORBIDDEN')
      const replace = input.carModels !== undefined || input.universal !== undefined
      const compatibilities = replace && !input.universal ? parseVehicleCompatibility(input.carModels) : []
      await db.$transaction(async (tx) => {
        if (replace) await tx.vehicleCompatibility.deleteMany({ where: { partId: part.id } })
        await tx.part.update({ where: { id: part.id }, data: { ...(replace ? { universal: Boolean(input.universal), carModels: input.universal ? null : serializeLegacyCompatibility(input.carModels), compatibilities: compatibilities.length ? { create: compatibilities } : undefined } : {}), ...(input.fitmentNotes !== undefined ? { fitmentNotes: input.fitmentNotes || null } : {}) } })
      })
      await audit({ actorId: user.id, action: 'SELLER_FITMENT_UPDATED', targetType: 'part', targetId: part.id })
      return {}
    }
    case 'buyer_account_update': {
      if (input.targetId !== user.id) throw new Error('ACTION_FORBIDDEN')
      const phone = input.phone === undefined ? undefined : input.phone ? normalizeEgyptianMobile(input.phone) : null
      if (input.phone && !phone) throw new Error('INVALID_ACTION_INPUT')
      await db.user.update({ where: { id: user.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone } : {}), ...(input.avatar !== undefined ? { avatar: input.avatar || null } : {}) } })
      await audit({ actorId: user.id, action: 'ACCOUNT_PROFILE_UPDATED', targetType: 'user', targetId: user.id })
      return {}
    }
    case 'seller_inventory_bulk_update': {
      const store = await db.store.findUnique({ where: { ownerId: user.id }, select: { id: true } })
      if (!store || (input.pricePercent === undefined && input.stockDelta === undefined)) throw new Error('INVALID_ACTION_INPUT')
      const where = input.targetIds?.length ? { id: { in: input.targetIds }, storeId: store.id } : { storeId: store.id, ...(input.entityName ? { OR: [{ name: { contains: input.entityName, mode: 'insensitive' as const } }, { brand: { contains: input.entityName, mode: 'insensitive' as const } }, { category: { contains: input.entityName, mode: 'insensitive' as const } }] } : {}) }
      const parts = await db.part.findMany({ where, select: { id: true, price: true, stock: true }, take: 51 })
      if (!parts.length || parts.length > 50) throw new Error('BULK_CAP_EXCEEDED')
      const changes = parts.map((part) => ({ id: part.id, price: input.pricePercent === undefined ? part.price : Math.max(1, Math.round(part.price * (1 + input.pricePercent / 100))), stock: input.stockDelta === undefined ? part.stock : Math.max(0, part.stock + input.stockDelta) }))
      await db.$transaction(async (tx) => {
        for (const change of changes) {
          const updated = await tx.part.updateMany({ where: { id: change.id, storeId: store.id }, data: { price: change.price, stock: change.stock } })
          if (updated.count !== 1) throw new Error('BULK_CHANGED')
        }
      })
      await audit({ actorId: user.id, action: 'SELLER_INVENTORY_BULK_UPDATED', targetType: 'store', targetId: store.id, metadata: { count: changes.length, pricePercent: input.pricePercent, stockDelta: input.stockDelta } })
      return {}
    }
    case 'order_action':
      await executeOrderAction(user, input.targetId!, input.status as OrderAction, input.trackingNumber)
      return {}
    case 'admin_part_block': {
      const targetState = input.status === 'BLOCKED'
      const updated = await db.part.updateMany({ where: { id: input.targetId!, blocked: !targetState }, data: { blocked: targetState } })
      if (updated.count !== 1) throw new Error('ACTION_STALE')
      return {}
    }
    case 'admin_user_role': {
      if (input.targetId === user.id) throw new Error('ACTION_FORBIDDEN')
      const target = await db.user.findUnique({ where: { id: input.targetId! }, include: { store: { select: { id: true } } } })
      if (!target) throw new Error('INVALID_ACTION_INPUT')
      if (target.role === 'ADMIN' && input.role !== 'ADMIN' && await db.user.count({ where: { role: 'ADMIN' } }) <= 1) throw new Error('LAST_ADMIN')
      if (target.role === 'SHOP_OWNER' && input.role !== 'SHOP_OWNER' && target.store) throw new Error('STORE_ROLE_CONFLICT')
      await db.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({ where: { id: target.id, role: target.role }, data: { role: input.role } })
        if (updated.count !== 1) throw new Error('ACTION_STALE')
        if (input.role === 'SHOP_OWNER' && !target.store) await tx.store.create({ data: { name: `متجر ${target.name}`, description: '', ownerId: target.id } })
      })
      return {}
    }
    case 'admin_store_verify': {
      const targetState = input.status === 'VERIFIED'
      const updated = await db.store.updateMany({ where: { id: input.targetId!, verified: !targetState }, data: { verified: targetState, verificationStatus: targetState ? 'APPROVED' : 'UNVERIFIED', verifiedAt: targetState ? new Date() : null } })
      if (updated.count !== 1) throw new Error('ACTION_STALE')
      return {}
    }
    case 'admin_report_decision': {
      const report = await db.report.findUnique({ where: { id: input.targetId! } })
      if (!report) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        const claimed = await tx.report.updateMany({ where: { id: report.id, status: 'OPEN' }, data: { status: input.status!, reviewedById: user.id } })
        if (claimed.count !== 1) throw new Error('ACTION_STALE')
        if (input.status === 'BLOCKED' && report.targetType === 'part') await tx.part.updateMany({ where: { id: report.targetId }, data: { blocked: true } })
      })
      return {}
    }
    case 'admin_verification_decision': {
      const verification = await db.sellerVerification.findUnique({ where: { id: input.targetId! }, include: { store: true } })
      if (!verification) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        const claimed = await tx.sellerVerification.updateMany({ where: { id: verification.id, status: 'PENDING' }, data: { status: input.status!, adminNote: input.description || null, reviewedAt: new Date() } })
        if (claimed.count !== 1) throw new Error('ACTION_STALE')
        await tx.store.update({ where: { id: verification.storeId }, data: { verificationStatus: input.status!, verified: input.status === 'APPROVED', verifiedAt: input.status === 'APPROVED' ? new Date() : null } })
      })
      return {}
    }
    case 'admin_dispute_decision': {
      const dispute = await db.dispute.findUnique({ where: { id: input.targetId! }, include: { order: { include: { store: true, part: true, items: true } } } })
      if (!dispute) throw new Error('INVALID_ACTION_INPUT')
      await db.$transaction(async (tx) => {
        const claimed = await tx.dispute.updateMany({ where: { id: dispute.id, status: 'OPEN' }, data: { status: input.status!, resolution: input.description!, reviewedById: user.id } })
        if (claimed.count !== 1) throw new Error('ACTION_STALE')
        if (input.status === 'RESOLVED_BUYER' && dispute.order.status !== 'RETURNED') {
          const claimedOrder = await tx.order.updateMany({ where: { id: dispute.orderId, status: dispute.order.status }, data: { status: 'RETURNED', paymentStatus: dispute.order.paymentStatus === 'PAID' ? 'REFUNDED' : dispute.order.paymentStatus } })
          if (claimedOrder.count !== 1) throw new Error('ACTION_STALE')
          await tx.orderTimeline.create({ data: { orderId: dispute.orderId, status: 'RETURNED', note: 'تم قبول طلب الحماية والاسترجاع بقرار الإدارة عبر المساعد' } })
          if (dispute.order.items.length) {
            for (const item of dispute.order.items) {
              if (item.partId) await tx.part.updateMany({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } })
            }
          } else {
            await tx.part.update({ where: { id: dispute.order.partId }, data: { stock: { increment: dispute.order.quantity } } })
          }
          if (dispute.order.couponCode) await tx.coupon.updateMany({ where: { code: dispute.order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
        }
      })
      await Promise.allSettled([
        createNotification({ userId: dispute.buyerId, title: 'تم تحديث النزاع', message: input.description!, type: 'DISPUTE', link: 'orders' }),
        createNotification({ userId: dispute.order.store.ownerId, title: 'تم تحديث النزاع', message: input.description!, type: 'DISPUTE', link: 'shop-dashboard' }),
      ])
      return {}
    }
  }
  throw new Error('ACTION_NOT_IMPLEMENTED')
}

async function executeOrderAction(user: SessionUser, orderId: string, action: OrderAction, trackingNumber?: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { part: true, store: true, items: true } })
  if (!order) throw new Error('INVALID_ACTION_INPUT')
  const buyerAllowed = ['cancel', 'deliver', 'return'].includes(action) && order.buyerId === user.id
  const sellerAllowed = ['approve', 'reject', 'ship'].includes(action) && order.store.ownerId === user.id
  if (!buyerAllowed && !sellerAllowed) throw new Error('ACTION_FORBIDDEN')
  const transition = resolveOrderTransition({ action, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod })
  await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({ where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus }, data: { status: transition.status, paymentStatus: transition.paymentStatus, ...(action === 'ship' ? { trackingNumber: trackingNumber || null } : {}) } })
    if (claimed.count !== 1) throw new Error('ORDER_CHANGED')
    await tx.orderTimeline.create({ data: { orderId: order.id, status: transition.status, note: 'تم تنفيذ الإجراء بعد تأكيد اقتراح مساعد غيار ماركت' } })
    if (transition.restoreStock) {
      if (order.items.length) {
        for (const item of order.items) {
          if (item.partId) await tx.part.updateMany({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } })
        }
      } else {
        await tx.part.update({ where: { id: order.partId }, data: { stock: { increment: order.quantity } } })
      }
      if (order.couponCode) {
        await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
      }
    }
  })
  const recipient = order.buyerId === user.id ? order.store.ownerId : order.buyerId
  const label = order.items.length > 1 ? `${order.items[0].productName} و${order.items.length - 1} منتج آخر` : order.items[0]?.productName || order.part.name
  await createNotification({ userId: recipient, title: 'تم تحديث الطلب', message: `تم تحديث طلب ${label} إلى ${transition.status}.`, type: 'ORDER_STATUS', link: order.buyerId === recipient ? 'orders' : 'shop-dashboard' }).catch((error) => console.error('AI order notification failed:', error))
}
