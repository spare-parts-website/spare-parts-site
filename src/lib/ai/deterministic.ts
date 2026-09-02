import { cleanWebSearchQuery } from './planner.ts'
import type { AIClientContext, AIProposalInput, AIRole, AIToolName } from './types.ts'
import { isPartsBrowseRequest, isPurchaseRequest } from './normalization.ts'

export type DeterministicRequest =
  | { kind: 'answer'; answer: string }
  | { kind: 'tool'; toolName: AIToolName; input: Record<string, unknown> }
  | { kind: 'tools'; requests: Array<{ toolName: AIToolName; input: Record<string, unknown> }> }

const HELP = /(?:ماذا تستطيع|تقدر تعمل|تقدر تساعد|بتعمل ايه|بتعمل إيه|الأوامر|مساعدة|help|what can you do|capabilit|how (?:do|can) i use)/i
const GREETING = /^(?:hi|hello|hey|أهلا|اهلا|أهلًا|مرحبا|مرحباً|السلام عليكم|صباح الخير|مساء الخير)[!.,،؟?\s]*$/i

export function planDeterministicRequest(input: {
  message: string
  role: AIRole
  forcedTool?: AIToolName
  clientContext: AIClientContext
}): DeterministicRequest | undefined {
  const message = input.message.replace(/\s+/g, ' ').trim()
  if (!message) return undefined
  if (GREETING.test(message)) return { kind: 'answer', answer: greeting(input.role, isEnglish(message)) }
  if (HELP.test(message)) return { kind: 'answer', answer: help(input.role, isEnglish(message)) }
  if (!input.forcedTool) return undefined
  if (input.forcedTool === 'getSellerWorkspace') {
    const requests = sellerWorkspaceInputs(message).map((toolInput) => ({ toolName: input.forcedTool!, input: toolInput }))
    if (requests.length > 1) return { kind: 'tools', requests }
  }
  if (input.forcedTool === 'lookupAdminRecords') {
    const requests = adminLookupInputs(message).map((toolInput) => ({ toolName: input.forcedTool!, input: toolInput }))
    if (requests.length > 1) return { kind: 'tools', requests }
  }
  const toolInput = deterministicToolInput(input.forcedTool, message, input.role, input.clientContext)
  return toolInput ? { kind: 'tool', toolName: input.forcedTool, input: toolInput } : undefined
}

export function deterministicToolInput(toolName: AIToolName, message: string, role: AIRole, context: AIClientContext): Record<string, unknown> | undefined {
  if (toolName === 'getAccountContext') {
    const focus = accountFocus(message)
    const orderStatus = focus === 'orders' ? sellerOrderStatus(message) : undefined
    return { focus, ...(orderStatus ? { orderStatus } : {}) }
  }
  if (toolName === 'getSellerInsights') return { focus: sellerInsightFocus(message) }
  if (toolName === 'getAdminInsights') return { focus: adminInsightFocus(message) }
  if (toolName === 'getSupportTickets' || toolName === 'getAdminSupportTickets') {
    const status = supportStatus(message)
    const selectedTicket = context.selection?.kind === 'support_ticket' || context.selection?.kind === 'message' ? context.selection.id : undefined
    return { ...(selectedTicket ? { ticketId: selectedTicket } : {}), ...(status ? { status } : {}), ...(toolName === 'getAdminSupportTickets' && message.length > 20 ? { search: cleanSubject(message, [/(?:اعرض|هات|شوف|تذاكر|الدعم|support|tickets?|المفتوحة|المفتوح|open|أحدث|آخر|latest|last)/gi]) || undefined } : {}), limit: requestedLimit(message, toolName === 'getAdminSupportTickets' ? 10 : 5) }
  }
  if (toolName === 'getBuyerDisputes') {
    const status = /(?:مفتوح|مفتوحة|open)/i.test(message) ? 'OPEN' : /(?:للمشتري|حسم المشتري|resolved buyer)/i.test(message) ? 'RESOLVED_BUYER' : /(?:للبائع|حسم البائع|resolved seller)/i.test(message) ? 'RESOLVED_SELLER' : /(?:مرفوض|rejected)/i.test(message) ? 'REJECTED' : undefined
    return { ...(status ? { status } : {}), limit: requestedLimit(message, 10) }
  }
  if (toolName === 'getSellerVerification') return {}
  if (toolName === 'getAdminReviews') {
    const state = /(?:محظور|محظورة|blocked)/i.test(message) ? 'blocked' : /(?:نشط|نشطة|active)/i.test(message) ? 'active' : 'all'
    const rating = requestedRating(message)
    return { state, ...(rating ? { rating } : {}), ...(message.length > 20 ? { query: cleanSubject(message, [/(?:اعرض|هات|شوف|تقييمات?|مراجعة|reviews?|ratings?|محظور|محظورة|blocked|نشط|نشطة|active|نجوم?|stars?)/gi]) || undefined } : {}), limit: requestedLimit(message, 10) }
  }
  if (toolName === 'getAdminEmailDeliverability') {
    const days = message.match(/(?:7|30|90)/)?.[0]
    return { days: days ? Number(days) : 30 }
  }
  if (toolName === 'getAdminModeration') return {}
  if (toolName === 'searchInternet') return { query: cleanWebSearchQuery(message) }
  if (toolName === 'searchMarketplace') {
    const query = cleanSubject(message, [
      /(?:دور|ابحث|فتش|عايز|أريد|اريد|هات|اعرض|عرض|show\s+me|show|list|display|find|search|i need|i want|looking for)/gi,
      /(?:^|\s)(?:على|عن|for)(?=\s|$)/gi,
      /(?:^|\s)(?:لي|ليا|عندي|من فضلك|لو سمحت)(?=\s|$)/gi,
      /(?:^|\s)(?:هل|في|يوجد|للبيع|بيع|موجود|متاح|available|for\s+sale|sale|offer|listing|buy|purchase|مطلوب|شراء|اشتري|واحد|one|الأول|الاول|first|الثاني|التاني|second|سيارة|cars?)(?=\s|[؟?.,،!؛:]|$)/gi,
      /(?:في|داخل)?\s*غيار ماركت/gi,
      /(?:غيار|ل{1,2}جنط)/gi,
      /(?:^|\s)(?:لـ?|لدي|بما|فيها|طراز)(?=\s|$)/gi,
      /(?:قطعة|قطع غيار|متجر|store|shop|part|parts|السلة|cart)/gi,
    ])
    const fallback = context.previousSearch
      ? cleanSubject(context.previousSearch, [/(?:دور|ابحث|فتش|عايز|أريد|اريد|هات|اعرض|عرض|show\s+me|show|list|display|find|search|i need|i want|looking for|available|for\s+sale|sale|offer|listing|buy|purchase|للبيع|بيع|موجود|متاح|شراء|اشتري)/gi])
      : context.selection?.kind === 'part' ? context.selection.label
        : context.previousEntities?.filter((entity) => entity.kind === 'part').slice(0, 3).map((entity) => entity.label).join(' ') || ''
    // “اعرض القطع” and “أريد شراء واحد” are follow-ups, not literal search
    // terms. Reuse the last server-backed query/card labels instead.
    if (isPartsBrowseRequest(message) || isPurchaseRequest(message)) {
      return fallback ? { query: fallback.slice(0, 120), limit: requestedLimit(message, 8) } : undefined
    }
    return (query || fallback) ? { query: (query || fallback).slice(0, 120), limit: requestedLimit(message, 8) } : undefined
  }
  if (toolName === 'compareMarketplace') {
    const query = cleanSubject(message, [/(?:قارن|مقارنة|مقارنه|compare|الموجود|المتاح|أحسن|أفضل|best|available)/gi, /(?:^|\s)(?:بين|من|في|على|عن|for|the)(?=\s|$)/gi])
    const fallback = context.previousSearch ? cleanSubject(context.previousSearch, [/(?:دور|ابحث|فتش|عايز|أريد|اريد|هات|اعرض|عرض|show\s+me|show|list|display|find|search|i need|i want|looking for|available|for\s+sale|sale|offer|listing|buy|purchase|للبيع|بيع|موجود|متاح|شراء|اشتري)/gi]) : ''
    return { query: (query || fallback || message).slice(0, 120), limit: Math.min(8, requestedLimit(message, 3)) }
  }
  if (toolName === 'findCompatibleParts') {
    const query = cleanSubject(message, [/(?:هل|دور|ابحث|عايز|find|search|compatible|fit|fits|متوافق|ينفع|يركب)/gi, /(?:^|\s)(?:عن|مع|على|لـ?|for)(?=\s|$)/gi])
    return { carDescription: message.slice(0, 160), ...(query && query.length < message.length ? { query: query.slice(0, 120) } : {}) }
  }
  if (toolName === 'getCheckoutPreview') return {}
  if (toolName === 'navigate') return navigationInput(message, role)
  if (toolName === 'getSellerWorkspace') return sellerWorkspaceInput(message)
  if (toolName === 'suggestSellerPrice') {
    const entityName = cleanSubject(message, [/(?:اقترح|نصيحة|مناسب|suggest|recommend|advice)/gi, /(?:لي|لسعر|سعر|price|for|my|القطعة|قطعة)/gi])
    return entityName || context.selection?.kind === 'part' ? { ...(entityName ? { entityName } : {}) } : undefined
  }
  if (toolName === 'resolveSellerRecord') {
    const kind = /(?:كوبون|coupon)/i.test(message) ? 'coupon' : /(?:رسال|message)/i.test(message) ? 'message' : undefined
    if (!kind) return undefined
    return { kind, recency: recency(message), ...queryUnlessRecency(message, kind === 'coupon' ? /(?:كوبون|coupon)/gi : /(?:رسال(?:ة|تي|ات)?|message|customer|عميل)/gi) }
  }
  if (toolName === 'lookupAdminRecords') return adminLookupInput(message)
  if (toolName === 'prepareAction') return actionInput(message, role, context) as Record<string, unknown> | undefined
  if (toolName === 'prepareDraft') return draftInput(message, role)
  return undefined
}

export function accountFocus(message: string): 'overview' | 'orders' | 'cart' | 'favorites' {
  if (/(?:طلباتي|آخر طلب|أحدث طلب|my orders?|last order|latest order)/i.test(message)) return 'orders'
  if (/(?:السلة|cart)/i.test(message)) return 'cart'
  if (/(?:مفضل|wishlist|favorites?)/i.test(message)) return 'favorites'
  return 'overview'
}

export function sellerInsightFocus(message: string): 'overview' | 'low_stock' | 'out_of_stock' | 'sales' | 'orders' | 'rating' {
  if (/(?:نفد|خلص|نافد|out of stock|zero stock)/i.test(message)) return 'out_of_stock'
  if (/(?:مخزون(?:ها|ه|ي)?\s+(?:قليل|منخفض)|ناقص|نفد|خلص|low stock|out of stock)/i.test(message)) return 'low_stock'
  if (/(?:تقييم|rating|reviews?)/i.test(message)) return 'rating'
  if (/(?:طلبات|عدد الطلبات|orders?)/i.test(message) && !/(?:مبيعات|sales|revenue)/i.test(message)) return 'orders'
  if (/(?:مبيعات|إيراد|ايراد|دخل|ربح|sales|revenue)/i.test(message)) return 'sales'
  return 'overview'
}

export function adminInsightFocus(message: string): 'overview' | 'users' | 'stores' | 'parts' | 'orders' | 'reports' | 'disputes' | 'revenue' {
  if (/(?:بلاغ|reports?)/i.test(message)) return 'reports'
  if (/(?:نزاع|disputes?)/i.test(message)) return 'disputes'
  if (/(?:إيراد|ايراد|قيمة الطلبات|revenue|sales value)/i.test(message)) return 'revenue'
  if (/(?:مستخدم|users?)/i.test(message)) return 'users'
  if (/(?:متجر|stores?)/i.test(message)) return 'stores'
  if (/(?:قطعة|قطع|parts?|products?)/i.test(message)) return 'parts'
  if (/(?:طلب|orders?)/i.test(message)) return 'orders'
  return 'overview'
}

function sellerWorkspaceInput(message: string) {
  const section = /(?:طلب|طلبات|order)/i.test(message) ? 'orders'
    : /(?:كوبون|كوبونات|coupon|offer)|(?:^|\s)(?:عرض|عروض)(?=\s|$)/i.test(message) ? 'coupons'
      : /(?:رسال|رسائ|message|customer)/i.test(message) ? 'messages'
        : /(?:تقييم|review|rating)/i.test(message) ? 'reviews' : 'listings'
  const sectionWords: Record<string, RegExp> = {
    orders: /(?:(?:ال)?طلب(?:اتي|ات|ي)?|orders?)/gi, coupons: /(?:(?:ال)?كوبون(?:اتي|ات)?|(?:ال)?(?:عرض|عروض)|coupons?|offers?)/gi,
    messages: /(?:(?:ال)?رس(?:ال|ائ)(?:ة|تي|ات|ل)?|messages?|customers?|(?:ال)?(?:عميل|عملاء))/gi, reviews: /(?:(?:ال)?تقييم(?:اتي|ات)?|reviews?|rating)/gi,
    listings: /(?:(?:ال)?قطعة|(?:ال)?قطع|(?:ال)?منتجات?|(?:ال)?مخزون|listings?|parts?|product|inventory)/gi,
  }
  const orderStatus = sellerOrderStatus(message)
  const rating = requestedRating(message)
  const listingState = sellerListingState(message)
  const couponState = sellerCouponState(message)
  const messageState = sellerMessageState(message)
  const filters = section === 'listings' ? { ...(listingState !== 'all' ? { listingState } : {}) }
    : section === 'orders' ? { ...(orderStatus ? { orderStatus } : {}) }
      : section === 'coupons' ? { ...(couponState !== 'all' ? { couponState } : {}) }
        : section === 'messages' ? { ...(messageState !== 'all' ? { messageState } : {}) }
          : { ...(rating ? { rating } : {}) }
  const filterWords = /(?:منخفض|قليل|نافد|نفد|خلص|محظور|نشط|فعال|متوقف|منتهي|مقروء|غير\s*(?:ال)?مقروء(?:ة)?|جديد|معلق|قيد الانتظار|مقبول|مرفوض|مشحون|تم الشحن|مكتمل|تم التسليم|مرتجع|ملغي|واحد(?:ة)?|اثن(?:ان|ين)|low|stock|out of|blocked|active|inactive|expired|unread|read|pending|approved|rejected|shipped|delivered|returned|cancelled|stars?|نج(?:مة|متان|متين|وم))/gi
  return { section, recency: recency(message), limit: requestedLimit(message, 10), ...filters, ...queryUnlessRecency(message, new RegExp(`${sectionWords[section].source}|${filterWords.source}`, 'gi')) }
}

export function sellerListingState(message: string): 'all' | 'active' | 'blocked' | 'low_stock' | 'out_of_stock' {
  if (/(?:نفد|خلص|نافد|out of stock|zero stock)/i.test(message)) return 'out_of_stock'
  if (/(?:مخزون(?:ها|ه|ي)?\s+(?:قليل|منخفض)|low stock)/i.test(message)) return 'low_stock'
  if (/(?:محظور|محظورة|blocked)/i.test(message)) return 'blocked'
  if (/(?:نشط|نشطة|active)/i.test(message)) return 'active'
  return 'all'
}

export function sellerOrderStatus(message: string): string | undefined {
  const statuses: Array<[RegExp, string]> = [
    [/(?:قيد الانتظار|معلق|جديد|pending)/i, 'PENDING'], [/(?:تمت الموافقة|مقبول|approved)/i, 'APPROVED'],
    [/(?:مرفوض|rejected)/i, 'REJECTED'], [/(?:مدفوع|paid)/i, 'PAID'], [/(?:تم الشحن|مشحون|shipped)/i, 'SHIPPED'],
    [/(?:تم التسليم|مكتمل|delivered|completed)/i, 'DELIVERED'], [/(?:مرتجع|returned)/i, 'RETURNED'], [/(?:ملغي|ملغى|cancelled|canceled)/i, 'CANCELLED'],
  ]
  return statuses.find(([pattern]) => pattern.test(message))?.[1]
}

export function sellerCouponState(message: string): 'all' | 'active' | 'inactive' | 'expired' {
  if (/(?:منتهي|expired)/i.test(message)) return 'expired'
  if (/(?:متوقف|غير فعال|inactive|disabled)/i.test(message)) return 'inactive'
  if (/(?:فعال|نشط|active)/i.test(message)) return 'active'
  return 'all'
}

export function sellerMessageState(message: string): 'all' | 'unread' | 'read' | 'incoming' {
  if (/(?:غير\s*(?:ال)?مقروء|لم تقرأ|unread)/i.test(message)) return 'unread'
  if (/(?:مقروء|read)/i.test(message)) return 'read'
  if (/(?:وارد|عميل|incoming|customer)/i.test(message)) return 'incoming'
  return 'all'
}

function supportStatus(message: string): 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'WAITING_FOR_SUPPORT' | 'RESOLVED' | 'CLOSED' | undefined {
  if (/(?:مفتوح|مفتوحة|open)/i.test(message)) return 'OPEN'
  if (/(?:قيد العمل|in progress)/i.test(message)) return 'IN_PROGRESS'
  if (/(?:بانتظار العميل|waiting for customer)/i.test(message)) return 'WAITING_FOR_CUSTOMER'
  if (/(?:بانتظار الدعم|waiting for support)/i.test(message)) return 'WAITING_FOR_SUPPORT'
  if (/(?:محلول|تم الحل|resolved)/i.test(message)) return 'RESOLVED'
  if (/(?:مغلق|مغلقة|closed)/i.test(message)) return 'CLOSED'
  return undefined
}

function requestedRating(message: string) {
  const match = message.match(/(?:تقييم|rating|نجوم?|stars?)\s*(?:=|:)?\s*([1-5])|([1-5])\s*(?:نجوم?|stars?)/i)
  if (match) return Number(match[1] || match[2])
  if (/(?:نجمة|تقييم)\s+واحد(?:ة)?/i.test(message)) return 1
  if (/(?:نجمتان|نجمتين|تقييم)\s+اثن(?:ان|ين)|تقييم\s+2/i.test(message)) return 2
  return undefined
}

function sellerWorkspaceInputs(message: string) {
  const sections = [
    [/(?:قطعة|قطع|منتج|منتجات|مخزون|listing|parts?|products?|inventory)/i, 'listings'],
    [/(?:طلب|طلبات|orders?)/i, 'orders'], [/(?:كوبون|كوبونات|coupons?|offers?)|(?:^|\s)(?:عرض|عروض)(?=\s|$)/i, 'coupons'],
    [/(?:رسال|رسائ|messages?|customer)/i, 'messages'], [/(?:تقييم|reviews?|rating)/i, 'reviews'],
  ] as const
  const matched = sections.filter(([pattern]) => pattern.test(message)).map(([, section]) => section)
  if (matched.length < 2) return [sellerWorkspaceInput(message)]
  return [...new Set(matched)].slice(0, 4).map((section) => ({ section, recency: recency(message), limit: requestedLimit(message, 5) }))
}

function adminLookupInput(message: string) {
  const kind = /(?:مستخدم|user|account)/i.test(message) ? 'user'
    : /(?:متجر|store|shop)/i.test(message) ? 'store'
      : /(?:بلاغ|report)/i.test(message) ? 'report'
        : /(?:توثيق|verification)/i.test(message) ? 'verification'
          : /(?:نزاع|dispute)/i.test(message) ? 'dispute'
            : /(?:طلب|order)/i.test(message) ? 'order'
              : /(?:قطعة|part|product|offer)/i.test(message) ? 'part' : undefined
  if (!kind) return undefined
  const date = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  const kindWords = /(?:مستخدم(?:ين)?|user|account|متجر(?:ات)?|store|shop|بلاغ(?:ات)?|report|توثيق(?:ات)?|verification|نزاع(?:ات)?|dispute|طلب(?:ات)?|order|قطعة|قطع|part|product|offer)/gi
  return { kind, recency: recency(message), ...(date ? { date } : {}), ...queryUnlessRecency(message, kindWords) }
}

function adminLookupInputs(message: string) {
  const kinds = [
    [/(?:مستخدم|users?|accounts?)/i, 'user'], [/(?:متجر|stores?|shops?)/i, 'store'], [/(?:قطعة|قطع|parts?|products?)/i, 'part'],
    [/(?:طلب|طلبات|orders?)/i, 'order'], [/(?:بلاغ|بلاغات|reports?)/i, 'report'], [/(?:توثيق|verifications?)/i, 'verification'], [/(?:نزاع|نزاعات|disputes?)/i, 'dispute'],
  ] as const
  const matched = kinds.filter(([pattern]) => pattern.test(message)).map(([, kind]) => kind)
  if (matched.length < 2) return [adminLookupInput(message)].filter((value): value is NonNullable<typeof value> => Boolean(value))
  return [...new Set(matched)].slice(0, 4).map((kind) => ({ kind, recency: recency(message) }))
}

function navigationInput(message: string, role: AIRole) {
  if (role === 'GUEST' && /(?:اخترت|اختيار|selected|choice)/i.test(message)) return { destination: 'login' }
  const destinations: Array<[RegExp, string]> = [
    [/(?:الرئيسية|home)/i, 'home'], [/(?:المتاجر|stores)/i, role === 'ADMIN' ? 'admin_stores' : 'stores'], [/(?:السلة|cart)/i, 'cart'],
    [/(?:المفضلة|wishlist)/i, 'wishlist'], [/(?:حسابي|الملف|profile)/i, 'profile'],
    ...(role === 'SHOP_OWNER' ? [[/(?:رسائل|messages)/i, 'seller_messages'] as [RegExp, string]] : []),
    [/(?:كوبونات|coupons)/i, 'seller_coupons'], [/(?:تحليل|إحصائ|analytics)/i, 'seller_analytics'],
    [/(?:بلاغات|reports)/i, 'admin_reports'], [/(?:مستخدمين|users)/i, 'admin_users'],
    [/(?:طلبات|orders)/i, role === 'ADMIN' ? 'admin_orders' : role === 'SHOP_OWNER' ? 'seller_orders' : 'orders'],
    [/(?:قطع|منتجات|القطع|قطع الغيار|parts|products)/i, role === 'ADMIN' ? 'admin_parts' : role === 'SHOP_OWNER' ? 'seller_parts' : 'parts'],
    [/(?:متاجر الإدارة|admin stores)/i, 'admin_stores'],
  ]
  const destination = destinations.find(([pattern]) => pattern.test(message))?.[1]
  return destination ? { destination } : undefined
}

function actionInput(message: string, role: AIRole, context: AIClientContext): AIProposalInput | undefined {
  const quantity = integerAfter(message, /(?:كمية|عدد|quantity|qty)/i) || integerAfter(message, /(?:أضف|اضف|add)\s+/i) || 1
  const selectionName = context.selection?.label
  const contextualPurchase = isPurchaseRequest(message) && !/(?:السلة|cart|اضف|أضف|ضيف|add)/i.test(message)
  const ordinalSelection = context.previousEntities?.filter((entity) => entity.kind === 'part')[
    /(?:الثاني|التاني|second|2nd)/i.test(message) ? 1 : /(?:الثالث|التالت|third|3rd)/i.test(message) ? 2 : 0
  ]
  const purchaseSelection = context.selection?.kind === 'part' ? context.selection : ordinalSelection
  if ((contextualPurchase || /(?:اخترت|اختيار|selected|choice)/i.test(message)) && purchaseSelection) {
    return { action: 'cart_add', quantity: 1, targetId: purchaseSelection.id, entityName: purchaseSelection.label }
  }
  if (/(?:فض[ّي]|افرغ|أفرغ|فرغ|clear|empty).*(?:السلة|cart)|(?:السلة|cart).*(?:فاضية|فارغة|clear|empty)/i.test(message)) return { action: 'cart_clear' }
  if (/(?:أضف|اضف|ضيف|حط|add).*(?:السلة|cart)/i.test(message)) return { action: 'cart_add', quantity, ...entityReference(message, selectionName || context.previousSearch, /(?:أضف|اضف|ضيف|حط|add|إلى|الى|في|السلة|cart|quantity|qty|كمية|عدد|الأفضل|المتاح|المتوفرة?)/gi) }
  if (/(?:شيل|احذف|remove|delete).*(?:السلة|cart)/i.test(message)) return { action: 'cart_remove', ...entityReference(message, selectionName, /(?:شيل|احذف|remove|delete|من|السلة|cart)/gi) }
  if (/(?:غير|عدل|حدث|set|change|update).*(?:كمية|عدد).*(?:السلة|cart)/i.test(message)) return { action: 'cart_update', quantity: integerAfter(message, /(?:إلى|الى|to|=|quantity|qty|كمية|عدد)/i) || 1, ...entityReference(message, selectionName, /(?:غير|عدل|حدث|set|change|update|كمية|عدد|إلى|الى|to|=|السلة|cart|\d+)/gi) }
  if ((role === 'BUYER' || role === 'SHOP_OWNER') && /(?:رد|reply|answer)/i.test(message) && (/(?:تذكرة|الدعم|support)/i.test(message) || context.selection?.kind === 'support_ticket') && (context.selection?.kind === 'support_ticket' || context.selection?.kind === 'message')) {
    const body = message.split(/[:：]/).slice(1).join(':').trim()
    return { action: 'buyer_support_reply', targetId: context.selection.id, message: body || undefined }
  }
  if ((role === 'BUYER' || role === 'SHOP_OWNER') && /(?:تذكرة|الدعم|support ticket)/i.test(message) && /(?:افتح|اعمل|create|open)/i.test(message)) {
    const subject = cleanSubject(message, [/(?:افتح|اعمل|create|open|تذكرة|الدعم|support|ticket|بخصوص|عن|regarding)/gi])
    const category = /(?:طلب|order)/i.test(message) ? 'ORDER' : /(?:حساب|account)/i.test(message) ? 'ACCOUNT' : /(?:دفع|payment)/i.test(message) ? 'PAYMENT' : 'GENERAL'
    const body = message.split(/[:：]/).slice(1).join(':').trim()
    return { action: 'buyer_support_create', subject: subject || 'طلب دعم', message: body || undefined, ticketCategory: category, ...(context.selection?.kind === 'order' ? { targetId: context.selection.id } : {}) }
  }
  if (role === 'BUYER' && /(?:قيم|قيّم|تقييم|review|rate)/i.test(message)) {
    const rating = integerAfter(message, /(?:تقييم|rating|نجوم?|stars?)/i) || integerBeforeOrAfter(message, /(?:نجوم?|stars?)/i)
    const reviewType = /(?:متجر|store)/i.test(message) ? 'store' : 'product'
    const comment = cleanSubject(message, [/(?:قيم|قيّم|تقييم|review|rate|القطعة|المنتج|المتجر|store|product|نجوم?|stars?|البائع|seller|التغليف|التعبئة|packaging|التوصيل|الشحن|delivery|shipping)/gi, /\b[1-5]\b/g]).replace(/(?:^|\s)و(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
    const sellerRating = dimensionRating(message, /(?:تقييم\s*)?(?:البائع|seller)(?:\s*rating)?/i)
    const packagingRating = dimensionRating(message, /(?:تقييم\s*)?(?:التغليف|التعبئة|packaging)(?:\s*rating)?/i)
    const deliveryRating = dimensionRating(message, /(?:تقييم\s*)?(?:التوصيل|الشحن|delivery|shipping)(?:\s*rating)?/i)
    return { action: 'buyer_review_create', reviewType, rating, description: comment || undefined, ...(sellerRating !== undefined ? { sellerRating } : {}), ...(packagingRating !== undefined ? { packagingRating } : {}), ...(deliveryRating !== undefined ? { deliveryRating } : {}), ...(context.selection?.id ? { targetId: context.selection.id } : {}) }
  }
  if (role === 'BUYER' && /(?:نزاع|مشكلة|dispute|return|ارجاع|إرجاع)/i.test(message) && /(?:افتح|اعمل|open|create|اطلب|request)/i.test(message)) {
    const reason = cleanSubject(message, [/(?:افتح|اعمل|open|create|اطلب|request|نزاع|مشكلة|dispute|return|ارجاع|إرجاع|على|علي|الطلب|order)/gi])
    return { action: 'buyer_dispute_create', disputeType: /(?:تالف|مكسور|damaged)/i.test(message) ? 'DAMAGED' : /(?:غلط|خطأ|wrong)/i.test(message) ? 'WRONG_ITEM' : 'OTHER', reason: reason || undefined, ...(context.selection?.kind === 'order' ? { targetId: context.selection.id } : {}) }
  }
  if ((role === 'BUYER' || role === 'SHOP_OWNER') && /(?:بلغ|بلاغ|report|flag)/i.test(message) && !/(?:تذكرة|دعم|support)/i.test(message)) {
    const selectedKind = context.selection?.kind
    const targetType = selectedKind === 'part' || selectedKind === 'store' || selectedKind === 'user'
      ? selectedKind
      : /(?:متجر|store|shop)/i.test(message) ? 'store' : /(?:مستخدم|حساب|user|account)/i.test(message) ? 'user' : 'part'
    const reason = message.split(/[:：]/).slice(1).join(':').trim() || cleanSubject(message, [/(?:بلغ|بلاغ|report|flag|عن|على|متجر|store|shop|قطعة|part|عرض|offer|مستخدم|حساب|user|account)/gi])
    return { action: 'buyer_report_create', targetType, reason: reason || undefined, ...(context.selection?.id ? { targetId: context.selection.id } : {}), ...(!context.selection?.id ? { entityName: cleanSubject(message, [/(?:بلغ|بلاغ|report|flag|عن|على|لأن|لان|بسبب)/gi]) || undefined } : {}) }
  }
  if ((role === 'BUYER' || role === 'SHOP_OWNER') && context.selection?.kind !== 'part' && !listingNameChange(message) && !/(?:قطعة|عرض|listing|part|product|منتج|متجر|store|shop)/i.test(message) && /(?:غير|عدل|حدث|change|update).*(?:اسمي|الاسم|name|الصورة|avatar|photo|الهاتف|phone)/i.test(message)) {
    const name = message.match(/(?:اسمي|الاسم|name)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim()
    const phone = profilePhone(message)
    const avatar = message.match(/https:\/\/[^\s،,؟?]+/i)?.[0]
    return { action: 'buyer_account_update', ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(avatar ? { avatar } : {}), ...(context.selection?.kind === 'user' ? { targetId: context.selection.id } : {}) }
  }
  if (role === 'BUYER' && /(?:ابعت|ابعث|ارسل|إرسال|send).*(?:للبائع|للمتجر|البائع|store|seller)/i.test(message)) {
    const body = message.split(/[:：]/).slice(1).join(':').trim() || cleanSubject(message, [/(?:ابعت|ابعث|ارسل|إرسال|send|للبائع|للمتجر|البائع|store|seller)/gi])
    return { action: 'buyer_message_send', message: body || undefined, messageKind: /(?:طلب|order)/i.test(message) ? 'order' : 'part', ...(context.selection?.id ? { targetId: context.selection.id } : {}), ...(context.selection?.kind === 'order' ? { messageKind: 'order' as const } : {}) }
  }
  if (/(?:المفضلة|wishlist|favorite)/i.test(message) && /(?:أضف|اضف|add|شيل|احذف|remove)/i.test(message)) {
    const remove = /(?:شيل|احذف|remove)/i.test(message)
    return { action: remove ? 'wishlist_store_remove' : 'wishlist_store_add', storeName: selectionName || cleanSubject(message, [/(?:أضف|اضف|add|شيل|احذف|remove|من|إلى|الى|المفضلة|wishlist|favorite|متجر|store)/gi]) }
  }
  if (/(?:طلب|order)/i.test(message)) {
    const statuses: Array<[RegExp, string]> = [[/(?:إلغاء|الغ|cancel)/i, 'cancel'], [/(?:استلم|deliver)/i, 'deliver'], [/(?:إرجاع|ارجع|return)/i, 'return'], [/(?:وافق|approve)/i, 'approve'], [/(?:ارفض|reject)/i, 'reject'], [/(?:اشحن|ship)/i, 'ship']]
    const status = statuses.find(([pattern]) => pattern.test(message))?.[1]
    if (status) return { action: 'order_action', status, orderDescription: cleanSubject(message, [/(?:إلغاء|الغ|cancel|استلم|deliver|إرجاع|ارجع|return|وافق|approve|ارفض|reject|اشحن|ship|طلب|order)/gi]) || undefined, recency: recency(message) }
  }
  if (role === 'SHOP_OWNER') {
    const bulkTargetIds = context.previousEntities?.filter((entity) => entity.kind === 'part').slice(0, 50).map((entity) => entity.id)
    const bulkPricePercent = percentageAfter(message, /(?:بنسبة|نسبة|percent|percentage|%|سعر|price)/i)
    const bulkStockDelta = signedIntegerAfter(message, /(?:المخزون|مخزون|stock|زود|زو[ّد]|زيادة|increase|نقص|قلل|decrease)/i)
    const asksForMany = /(?:كل|جميع|all|every|الأول(?:ين)?|اول(?:ين)?|أول\s*(?:اتنين|اثنين|2)|اول\s*(?:اتنين|اثنين|2)|first\s*(?:two|2)|قطع BMW|bmw parts|الموجودين|selected)/i.test(message)
    if (asksForMany && (bulkPricePercent !== undefined || bulkStockDelta !== undefined)) {
      return {
        action: 'seller_inventory_bulk_update',
        ...(bulkPricePercent !== undefined ? { pricePercent: bulkPricePercent } : {}),
        ...(bulkStockDelta !== undefined ? { stockDelta: bulkStockDelta } : {}),
        ...(bulkTargetIds?.length ? { targetIds: bulkTargetIds } : {}),
        ...(selectionName ? { entityName: selectionName } : bulkTargetIds?.length ? {} : { entityName: cleanSubject(message, [/(?:كل|جميع|all|every|زو[ّد]|زود|زيادة|نقص|قلل|بنسبة|نسبة|percent|percentage|%|المخزون|مخزون|stock|سعر|price|قطعة|قطع|parts?)/gi]) || undefined }),
      }
    }
    const price = numberAfter(message, /(?:إلى|الى|to)/i) ?? numberAfter(message, /(?:سعر|price)/i)
    const stock = /(?:زود|زو[ّد]|زيادة|نقص|قلل|increase|decrease)/i.test(message) ? undefined : integerAfter(message, /(?:مخزون|stock)/i)
    const stockDelta = !asksForMany ? signedIntegerAfter(message, /(?:زود|زو[ّد]|زيادة|increase|نقص|قلل|decrease)\s*(?:المخزون|مخزون|stock)?/i) : undefined
    const pricePercent = !asksForMany ? percentageAfter(message, /(?:بنسبة|نسبة|percent|percentage|%)/i) : undefined
    const listingFields = parseListingUpdateFields(message)
    const listingTarget = context.selection?.kind === 'part' || /(?:قطعة|عرض|listing|part|product|منتج)/i.test(message)
    const storeRequest = /(?:متجري|المتجر|store|shop|كوبون|coupon)/i.test(message)
    const listingFieldIntent = Object.keys(listingFields).length > 0
    const listingUpdate = /(?:غي[ّ]?ر|عدل|حدث|set|change|update|خلي|خل[ّي]|make|زو[ّد]|زود|زيادة|نقص|قلل|increase|decrease)/i.test(message) || ((/(?:أضف|اضف|ضيف|add)/i.test(message)) && listingFieldIntent && !/(?:قطعة\s+(?:جديدة|new)|عرض\s+(?:جديد|new)|create)/i.test(message))
    if (!storeRequest && listingUpdate && (listingTarget || listingFieldIntent || price !== undefined || stock !== undefined || stockDelta !== undefined || pricePercent !== undefined) && (price !== undefined || stock !== undefined || stockDelta !== undefined || pricePercent !== undefined || listingFieldIntent)) {
      const namedTarget = listingNameChange(message)?.target
      const fallbackReference = Object.keys(listingFields).length ? undefined : entityReference(message, selectionName || namedTarget, /(?:غي[ّ]?ر|عدل|حدث|set|change|update|خلي|خل[ّي]|make|زو[ّد]|زود|زيادة|نقص|قلل|increase|decrease|سعر|price|مخزون|stock|بنسبة|نسبة|percent|percentage|%|اسم(?:ها|ه)?|name|وصف|description|الفئة|التصنيف|category|الماركة|brand|الحالة|condition|رقم\s*(?:القطعة|OEM)|part\s*number|oem(?:\s*number)?|أسماء\s*بحث(?:\s*إضافية)?|search\s*aliases|ملاحظات\s*التوافق|fitment\s*notes|إلى|الى|to|جنيه|egp|قطعة|part|عرض|listing|product|منتج|\d+(?:[.,]\d+)?)/gi).entityName
      const referenceName = listingEntityReference(message, selectionName, namedTarget) || fallbackReference
      return { action: 'seller_part_update', price, stock, ...(stockDelta !== undefined ? { stockDelta } : {}), ...(pricePercent !== undefined ? { pricePercent } : {}), ...listingFields, ...(referenceName ? { entityName: referenceName } : {}) }
    }
    if (/(?:أنشئ|اعمل|أضف|اضف|ضيف|create|add).*(?:قطعة|عرض|listing|part|product)/i.test(message) && !/(?:السلة|cart)/i.test(message)) {
      const condition = listingCreateCondition(message)
      return { action: 'seller_part_create', name: listingCreateName(message), price: numberAfter(message, /(?:بسعر|سعر|price)/i), stock: integerAfter(message, /(?:مخزون|stock)/i), ...(condition ? { condition } : {}) }
    }
    if (/(?:رد|reply|answer|ابعت|ابعث|ارسل|إرسال|send).*(?:عميل|العميل|رسالة|message|customer|له|لها)/i.test(message) || (context.selection?.kind === 'message' && /(?:رد|reply|answer|ابعت|ابعث|ارسل|إرسال|send)/i.test(message))) {
      const body = message.split(/[:：]/).slice(1).join(':').trim() || cleanSubject(message, [/(?:رد|reply|answer|ابعت|ابعث|ارسل|إرسال|send|على|للعميل|للعميلة|عميل|العميل|رسالة|message|customer|قوله|قولها|له|لها)/gi])
      return { action: 'seller_message_send', message: body || undefined, ...(context.selection?.kind === 'message' ? { targetId: context.selection.id } : {}), ...(selectionName ? { entityName: selectionName } : {}) }
    }
    if (/(?:أنشئ|اعمل|أضف|اضف|create|add).*(?:كوبون|coupon)/i.test(message)) {
      const code = message.match(/(?:كود|كوبون|code|coupon)\s*[:=]?\s*([A-Za-z0-9_-]{3,40})/i)?.[1]?.toUpperCase()
      const discountPercent = integerBeforeOrAfter(message, /(?:%|خصم|discount)/i); const maxUses = integerBeforeOrAfter(message, /(?:استخدام|uses?|مرات)/i)
      return { action: 'seller_coupon_create', code, discountPercent, maxUses }
    }
    if (/(?:عدل|غير|حدث|update|change).*(?:كوبون|coupon)/i.test(message)) return { action: 'seller_coupon_update', code: message.match(/(?:كود|code)\s*[:=]?\s*([A-Za-z0-9_-]{3,40})/i)?.[1]?.toUpperCase(), discountPercent: integerBeforeOrAfter(message, /(?:%|خصم|discount)/i), maxUses: integerBeforeOrAfter(message, /(?:استخدام|uses?|مرات)/i), status: /(?:وقف|تعطيل|inactive|disable)/i.test(message) ? 'INACTIVE' : undefined, entityName: selectionName || cleanSubject(message, [/(?:عدل|غير|حدث|update|change|كوبون|coupon|كود|code|خصم|discount|استخدام|uses?|مرات)/gi]) }
    if (/(?:ضيف|أضف|اضف|update|change|عد[ّ]?ل|حدث).*(?:توافق|fitment|compatible)/i.test(message)) return { action: 'seller_fitment_update', carModels: cleanSubject(message, [/(?:ضيف|أضف|اضف|update|change|عد[ّ]?ل|حدث|توافق|fitment|compatible|مع|لـ|الى|إلى)/gi]) || undefined, ...(selectionName ? { entityName: selectionName } : {}) }
    if (/(?:غير|عدل|حدث|update|change).*(?:متجري|المتجر|store|shop)/i.test(message)) {
      const name = message.match(/(?:اسم(?:ه)?|name)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim()
      const address = message.match(/(?:العنوان|address)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim()
      const phone = profilePhone(message)
      const image = message.match(/https:\/\/[^\s،,؟?]+/i)?.[0]
      const description = /(?:وصف|description)/i.test(message) ? cleanSubject(message, [/(?:غير|عدل|حدث|update|change|وصف|description|المتجر|store|shop)/gi]) : undefined
      return { action: 'seller_store_update', ...(name ? { name } : {}), ...(description ? { description } : {}), ...(address ? { address } : {}), ...(phone ? { phone } : {}), ...(image ? { image } : {}) }
    }
  }
  if (role === 'ADMIN') {
    const selectedKind = context.selection?.kind
    const profileFieldRequest = /(?:غير|عدل|حدث|update|change).*(?:اسم|name|بريد|email|إيميل|هاتف|phone|صورة|avatar|photo|إشعارات|notifications|دور|role)/i.test(message)
    if (profileFieldRequest && (selectedKind === 'user' || /(?:مستخدم|حساب|user|account)/i.test(message))) {
      const namedTarget = message.match(/(?:اسم)\s+([^،,؟?]+?)\s+(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)
      const name = message.match(/(?:اسمه|اسمها|اسم(?:ه)?|name)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim() || namedTarget?.[2]?.trim()
      const targetName = namedTarget?.[1]?.trim()
      const email = message.match(/(?:البريد|الإيميل|email)\s*(?:إلى|الى|to|=|:)\s*([^\s،,؟?]+@[^\s،,؟?]+)/i)?.[1]?.trim()
      const phone = profilePhone(message)
      const avatar = message.match(/https:\/\/[^\s،,؟?]+/i)?.[0]
      const roleValue = /(?:مدير|admin)/i.test(message) ? 'ADMIN' : /(?:بائع|صاحب متجر|seller|shop owner)/i.test(message) ? 'SHOP_OWNER' : /(?:مشتري|buyer)/i.test(message) ? 'BUYER' : undefined
      const deliveryStatus = /(?:مرتد|bounce)/i.test(message) ? 'BOUNCED' : /(?:شكوى|complain)/i.test(message) ? 'COMPLAINED' : /(?:محظور|suppressed)/i.test(message) ? 'SUPPRESSED' : /(?:نشط|active)/i.test(message) ? 'ACTIVE' : undefined
      return { action: 'admin_user_update', ...(context.selection?.id ? { targetId: context.selection.id } : {}), ...(!context.selection?.id && targetName ? { entityName: targetName } : {}), ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(avatar ? { avatar } : {}), ...(roleValue ? { role: roleValue } : {}), ...(deliveryStatus ? { emailDeliveryStatus: deliveryStatus } : {}), ...(message.includes('بدون إشعارات') || /(?:إيقاف|تعطيل).*(?:إشعارات|notifications)/i.test(message) ? { emailNotifications: false } : /(?:تفعيل|شغل|تشغيل).*(?:إشعارات|notifications)/i.test(message) ? { emailNotifications: true } : {}) }
    }
    if (/(?:غير|عدل|حدث|update|change).*(?:دور|role)/i.test(message) && (selectedKind === 'user' || /(?:مستخدم|حساب|user|account)/i.test(message))) {
      const roleValue = /(?:مدير|admin)/i.test(message) ? 'ADMIN' : /(?:بائع|صاحب متجر|seller|shop owner)/i.test(message) ? 'SHOP_OWNER' : /(?:مشتري|buyer)/i.test(message) ? 'BUYER' : undefined
      return { action: 'admin_user_role', ...(context.selection?.id ? { targetId: context.selection.id } : {}), ...(roleValue ? { role: roleValue } : {}) }
    }
    if ((/(?:غير|عدل|حدث|update|change).*(?:تقييم|review|rating)/i.test(message) || (selectedKind === 'review' && /(?:احظر|حظر|block|unblock|إلغاء حظر)/i.test(message))) && (/(?:احظر|حظر|block|unblock|إلغاء حظر)/i.test(message) || selectedKind === 'review')) {
      const selectedReviewIsStore = context.selection?.kind === 'review' && /(?:تقييم متجر|store)/i.test(context.selection.label)
      return { action: 'admin_review_moderate', status: /(?:unblock|إلغاء حظر)/i.test(message) ? 'ACTIVE' : 'BLOCKED', reviewType: /(?:متجر|store)/i.test(message) || selectedReviewIsStore ? 'store' : 'product', ...(context.selection?.id ? { targetId: context.selection.id } : {}) }
    }
    const explicitStoreName = explicitStoreReference(message)
    const targetStoreName = selectionName || explicitStoreName
    const storeNameChange = message.match(/(?:متجر|store|shop)\s+["«]?[^،,؟?]+?["»]?\s+(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim()
    if (/(?:غير|عدل|حدث|update|change).*(?:متجر|store|shop)/i.test(message) && targetStoreName) return { action: 'admin_store_update', ...(storeNameChange || message.match(/(?:اسم(?:ه)?|name)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim() ? { name: storeNameChange || message.match(/(?:اسم(?:ه)?|name)\s*(?:إلى|الى|to|=|:)\s*([^،,؟?]+)/i)?.[1]?.trim() } : {}), ...( /(?:وصف|description)/i.test(message) ? { description: cleanSubject(message, [/(?:غير|عدل|حدث|update|change|وصف|description|متجر|store|shop)/gi]) } : {}), storeName: targetStoreName }
    const adminListingFields = parseListingUpdateFields(message)
    const adminPartTarget = selectedKind === 'part' || /(?:قطعة|عرض|listing|part|product|منتج)/i.test(message)
    const adminStoreRequest = /(?:متجر|store|shop)/i.test(message)
    const adminListingFieldIntent = Object.keys(adminListingFields).length > 0
    const adminListingUpdate = /(?:غير|عدل|حدث|update|change|خلي|خل[ّي]|make|set|زو[ّد]|زود|زيادة|نقص|قلل|increase|decrease)/i.test(message) || ((/(?:أضف|اضف|ضيف|add)/i.test(message)) && adminListingFieldIntent && !/(?:قطعة\s+(?:جديدة|new)|عرض\s+(?:جديد|new)|create)/i.test(message))
    if (!adminStoreRequest && adminListingUpdate && (adminPartTarget || adminListingFieldIntent || numberAfter(message, /(?:إلى|الى|to|سعر|price)/i) !== undefined || integerAfter(message, /(?:مخزون|stock)/i) !== undefined) && (numberAfter(message, /(?:إلى|الى|to|سعر|price)/i) !== undefined || integerAfter(message, /(?:مخزون|stock)/i) !== undefined || adminListingFieldIntent)) {
      const namedTarget = listingNameChange(message)?.target
      const fallbackReference = Object.keys(adminListingFields).length ? undefined : entityReference(message, selectionName || namedTarget, /(?:غير|عدل|حدث|update|change|خلي|خل[ّي]|make|set|سعر|price|مخزون|stock|وصف|description|الفئة|التصنيف|category|الماركة|brand|الحالة|condition|رقم\s*(?:القطعة|OEM)|part\s*number|oem(?:\s*number)?|أسماء\s*بحث(?:\s*إضافية)?|search\s*aliases|ملاحظات\s*التوافق|fitment\s*notes|اسم(?:ها|ه)?|name|صورة|image|إلى|الى|to|قطعة|عرض|listing|part|offer|product|منتج|\d+(?:[.,]\d+)?)/gi).entityName
      const referenceName = listingEntityReference(message, selectionName, namedTarget) || fallbackReference
      return { action: 'admin_part_update', ...(context.selection?.id ? { targetId: context.selection.id } : {}), ...adminListingFields, price: numberAfter(message, /(?:إلى|الى|to|سعر|price)/i), stock: integerAfter(message, /(?:مخزون|stock)/i), ...(referenceName ? { entityName: referenceName } : {}) }
    }
    if (/(?:احظر|حظر|block|unblock|إلغاء حظر)/i.test(message) && /(?:قطعة|part|product)/i.test(message)) return { action: 'admin_part_block', status: /(?:unblock|إلغاء حظر)/i.test(message) ? 'ACTIVE' : 'BLOCKED', ...entityReference(message, selectionName, /(?:احظر|حظر|block|unblock|إلغاء حظر|قطعة|part|product)/gi) }
    if (/(?:وثق|اعتمد|verify|unverify|إلغاء اعتماد)/i.test(message) && /(?:متجر|store)/i.test(message)) return { action: 'admin_store_verify', status: /(?:unverify|إلغاء اعتماد)/i.test(message) ? 'UNVERIFIED' : 'VERIFIED', storeName: selectionName || cleanSubject(message, [/(?:وثق|اعتمد|verify|unverify|إلغاء اعتماد|متجر|store)/gi]) }
    if (/(?:وافق|approve|ارفض|reject)/i.test(message) && /(?:توثيق|verification)/i.test(message)) return { action: 'admin_verification_decision', status: /(?:ارفض|reject)/i.test(message) ? 'REJECTED' : 'APPROVED', entityName: selectionName || cleanSubject(message, [/(?:وافق|approve|ارفض|reject|طلب|توثيق|verification)/gi]) }
    if (/(?:راجع|حل|احسم|اتخذ|قرر|dismiss|review|resolve|decide)/i.test(message) && /(?:بلاغ|report)/i.test(message)) return { action: 'admin_report_decision', status: /(?:تجاهل|ارفض|dismiss|reject)/i.test(message) ? 'DISMISSED' : /(?:احظر|حظر|block)/i.test(message) ? 'BLOCKED' : 'REVIEWED', ...(context.selection?.kind === 'report' ? { targetId: context.selection.id } : { entityName: cleanSubject(message, [/(?:راجع|حل|احسم|اتخذ|قرر|dismiss|review|resolve|decide|بلاغ|report|تجاهل|ارفض|احظر|حظر|block)/gi]) || undefined }) }
    if (/(?:حل|احسم|اتخذ|قرر|وافق|ارفض|resolve|decide|reject)/i.test(message) && /(?:نزاع|dispute)/i.test(message)) {
      const description = message.split(/[:：]/).slice(1).join(':').trim() || cleanSubject(message, [/(?:حل|احسم|اتخذ|قرر|وافق|ارفض|resolve|decide|reject|نزاع|dispute|لصالح|للمشتري|للبائع|buyer|seller)/gi])
      const status = /(?:للبائع|لصالح البائع|seller)/i.test(message) ? 'RESOLVED_SELLER' : /(?:للمشتري|لصالح المشتري|buyer)/i.test(message) ? 'RESOLVED_BUYER' : 'REJECTED'
      return { action: 'admin_dispute_decision', status, description: description || undefined, ...(context.selection?.kind === 'dispute' ? { targetId: context.selection.id } : {}) }
    }
    const supportStatusChange = /(?:تذكرة|تذاكر|دعم|support|ticket)/i.test(message) && /(?:افتح|فتح|open|ابدأ|start|قيد العمل|in progress|بانتظار العميل|waiting for customer|بانتظار الدعم|waiting for support|حل|محلول|تم الحل|resolve|resolved|اقفل|اغلق|أغلق|مغلق|مغلقة|close|closed)/i.test(message)
    if (supportStatusChange) {
      const status = /(?:اقفل|اغلق|أغلق|مغلق|مغلقة|close|closed)/i.test(message) ? 'CLOSED'
        : /(?:قيد العمل|in progress)/i.test(message) ? 'IN_PROGRESS'
          : /(?:بانتظار العميل|waiting for customer)/i.test(message) ? 'WAITING_FOR_CUSTOMER'
            : /(?:بانتظار الدعم|waiting for support)/i.test(message) ? 'WAITING_FOR_SUPPORT'
              : /(?:حل|محلول|تم الحل|resolve|resolved)/i.test(message) ? 'RESOLVED' : 'OPEN'
      return { action: 'admin_support_status', status, ...(context.selection?.kind === 'support_ticket' ? { targetId: context.selection.id } : { entityName: cleanSubject(message, [/(?:افتح|فتح|open|ابدأ|start|قيد العمل|in progress|بانتظار العميل|waiting for customer|بانتظار الدعم|waiting for support|حل|محلول|تم الحل|resolve|resolved|اقفل|اغلق|أغلق|مغلق|مغلقة|close|closed|تذكرة|تذاكر|دعم|support|ticket)/gi]) || undefined }) }
    }
    if (/(?:رد|ابعت|ابعث|ارسل|إرسال|reply|send).*(?:تذكرة|دعم|support)/i.test(message) || (context.selection?.kind === 'support_ticket' && /(?:رد|ابعت|ابعث|ارسل|إرسال|reply|send)/i.test(message))) return { action: 'admin_support_reply', message: message.split(/[:：]/).slice(1).join(':').trim() || undefined, ...(context.selection?.id ? { targetId: context.selection.id } : {}) }
    if (/(?:اعمل|أنشئ|أضف|اضف|create|add).*(?:عرض|قطعة|part|offer).*(?:ل(?:ه|ها)|للبائع|seller|store|متجر)/i.test(message)) return { action: 'admin_part_create', name: listingCreateName(message), price: numberAfter(message, /(?:سعر|price)/i), stock: integerAfter(message, /(?:مخزون|stock)/i), condition: listingCreateCondition(message), storeName: context.selection?.kind === 'store' ? selectionName : explicitStoreName, ...parseListingUpdateFields(message) }
  }
  return undefined
}

function draftInput(message: string, role: AIRole) {
  const body = message.replace(/^(?:اكتب|جهز|حض[ّ]?ر|صياغة|مسودة|draft|write)\s*/i, '').trim()
  if (!body) return undefined
  if (/(?:بحث|search)/i.test(message)) return { target: 'search', fields: { query: cleanSubject(body, [/(?:بحث|search)/gi]) } }
  if (role === 'SHOP_OWNER' && /(?:كوبون|coupon)/i.test(message)) return { target: 'coupon', fields: { description: body } }
  if (role === 'SHOP_OWNER' && /(?:قطعة|منتج|listing|product)/i.test(message)) return { target: 'listing', fields: { description: body } }
  if (role === 'ADMIN') return { target: 'moderation_note', fields: { note: body } }
  if (role !== 'GUEST') return { target: 'message', fields: { message: body } }
  return undefined
}

const LISTING_FIELD_MARKERS = String.raw`(?:اسم(?:\s+(?:القطعة|العرض|المنتج))?|الاسم|name|وصف|description|الفئة|التصنيف|category|الماركة|البراند|brand|الحالة|condition|رقم\s*القطعة|part\s*number|OEM\s*رقم|رقم\s*OEM|oem\s*number|oem|أسماء\s*بحث(?:\s*إضافية)?|مرادفات\s*البحث|search\s*aliases|aliases|ملاحظات\s*التوافق|fitment\s*notes)`
const FIELD_VALUE_PREFIX = String.raw`\s*(?:إلى|الى|to|=|:|هو|هي|بقى|تبقى)?\s*`

function explicitStoreReference(message: string) {
  const quoted = message.match(/(?:لمتجر|للمتجر|متجر|store|shop)\s*["«]([^"»]+)["»]/i)?.[1]
  if (quoted) return cleanFieldValue(quoted, 160)
  const match = message.match(/(?:لمتجر|للمتجر|متجر|store|shop)\s+([^،,؟?؛;]+?)(?=\s+(?:بسعر|سعر|price|مخزون|stock|الحالة|condition|اسم|name|وصف|description|العنوان|address|صورة|image|إلى|الى|to|=|لديه|لها|له|اعمل|أنشئ|أضف|create|add)|[،,؟?؛;]|$)/i)
  return cleanFieldValue(match?.[1], 160)
}

function listingCreateName(message: string) {
  const colonValue = message.match(/[:：]\s*(.+?)(?=\s+(?:بسعر|سعر|price|مخزون|stock|الحالة|condition)|$)/i)?.[1]
  let value = colonValue || message.replace(/^(?:.*?)(?:أنشئ|اعمل|أضف|اضف|ضيف|create|add)\s*/i, '')
  value = value.replace(/^(?:(?:له|لها|للبائع|seller|على|for|قطعة|عرض|listing|part|product|منتج)(?:\s+(?:جديدة?|new|مستعمل|used))?\s*)+/i, '')
  value = value.replace(/\s+(?:لمتجر|للمتجر|متجر|store|shop)\s+[^،,؟?؛;]+?(?=\s+(?:بسعر|سعر|price|مخزون|stock|الحالة|condition)|[،,؟?؛;]|$)/i, ' ')
  value = value.replace(/\s+(?:بسعر|سعر|price|مخزون|stock|الحالة|condition).*$/i, '')
  value = value.replace(/\s+و\s*$/i, '')
  return cleanFieldValue(value, 160)
}

function listingCreateCondition(message: string) {
  const labeled = normalizeConditionValue(listingFieldValue(message, /(?:الحالة|condition)/i, 120))
  if (labeled) return labeled
  if (/(?:استيراد\s*جديد|new\s*import|imported)/i.test(message)) return 'استيراد جديد'
  if (/(?:استيراد\s*مستعمل|used\s*import)/i.test(message)) return 'استيراد مستعمل'
  if (/(?:جديد|new)/i.test(message)) return 'جديد'
  if (/(?:مستعمل|used)/i.test(message)) return 'مستعمل'
  return undefined
}

function listingNameChange(message: string) {
  const match = message.match(/(?:اسم(?:\s+(?:القطعة|العرض|المنتج))?|الاسم|name)\s+([^،,؟?؛;]+?)\s+(?:إلى|الى|to|=|:)\s*([^،,؟?؛;]+)/i)
  if (!match) return undefined
  const target = cleanFieldValue(match[1], 160)
  const value = cleanFieldValue(match[2], 160)
  return target && value ? { target, value } : undefined
}

function listingFieldValue(message: string, marker: RegExp, maxLength: number) {
  const changed = message.match(new RegExp(`${marker.source}\\s+(?!(?:إلى|الى|to|=|:))([^،,؟?؛;]+?)\\s+(?:إلى|الى|to|=|:)\\s*([^،,؟?؛;]+)`, 'i'))
  if (changed) return cleanFieldValue(withoutTargetQualifier(changed[2]), maxLength)
  const boundary = String.raw`(?=\s+${LISTING_FIELD_MARKERS}${FIELD_VALUE_PREFIX}|[،,؛;]|$)`
  const direct = message.match(new RegExp(`${marker.source}${FIELD_VALUE_PREFIX}([^،,؟?؛;]+?)${boundary}`, 'i'))
  const loose = direct || message.match(new RegExp(`${marker.source}\\s+([^،,؟?؛;]+?)${boundary}`, 'i'))
  return loose ? cleanFieldValue(withoutTargetQualifier(loose[1]), maxLength) : undefined
}

function withoutTargetQualifier(value: string) {
  return value.replace(/\s+(?:ل(?:ل)?قطعة|ل(?:ل)?عرض|ل(?:ل)?منتج|for\s+(?:the\s+)?(?:part|listing|product))\s+.+$/i, '').trim()
}

function listingEntityReference(message: string, selected: string | undefined, namedTarget: string | undefined) {
  if (selected) return selected
  if (namedTarget) return namedTarget
  const qualified = message.match(/\s+(?:ل(?:ل)?قطعة|ل(?:ل)?عرض|ل(?:ل)?منتج|for\s+(?:the\s+)?(?:part|listing|product))\s+([^،,؟?؛;]+)$/i)?.[1]
  if (qualified && !isPronounReference(qualified)) return cleanFieldValue(qualified, 160)
  const conditionTarget = message.match(/(?:الحالة|condition)\s*(?:إلى|الى|to|=|:)?\s*(?:استيراد\s*(?:جديد|مستعمل)|new\s*import|used\s*import|imported|جديد|new|مستعمل|used|مجدد|refurbished)\s+(?:لـ?\s*|على\s+)([^،,؟?؛;]+)/i)?.[1]
  return conditionTarget && !isPronounReference(conditionTarget) ? cleanFieldValue(conditionTarget, 160) : undefined
}

function isPronounReference(value: string) {
  return /^(?:دي|ده|هذه|هذا|تلك|ذلك|it|this|the\s+one|القطعة|العرض|المنتج)$/i.test(value.trim())
}

function cleanFieldValue(value: string | undefined, maxLength: number) {
  return value?.trim().replace(/^["«'“”]+|["»'“”]+$/g, '').replace(/[؟?]+$/g, '').trim().slice(0, maxLength) || undefined
}

function normalizeConditionValue(value: string | undefined) {
  if (!value) return undefined
  if (/(?:استيراد\s*جديد|new\s*import|imported|جديد|new)/i.test(value)) return 'استيراد جديد'
  if (/(?:استيراد\s*مستعمل|used\s*import|مستورد\s*مستعمل)/i.test(value)) return 'استيراد مستعمل'
  if (/(?:مستعمل|used)/i.test(value)) return 'مستعمل'
  if (/(?:مجدد|refurbished|reconditioned)/i.test(value)) return 'مجدد'
  return value
}

function parseListingUpdateFields(message: string): Partial<Pick<AIProposalInput, 'name' | 'description' | 'category' | 'brand' | 'condition' | 'partNumber' | 'oemNumber' | 'searchAliases' | 'fitmentNotes' | 'image' | 'universal'>> {
  const nameChange = listingNameChange(message)
  const name = nameChange?.value || listingFieldValue(message, /(?:اسم(?:\s+(?:القطعة|العرض|المنتج))?|الاسم|name)/i, 160)
  const description = listingFieldValue(message, /(?:وصف|description)/i, 2000)
  const category = listingFieldValue(message, /(?:الفئة|التصنيف|category)/i, 120)
  const brand = listingFieldValue(message, /(?:الماركة|البراند|brand)/i, 80)
  const condition = normalizeConditionValue(listingFieldValue(message, /(?:الحالة|condition)/i, 120))
  const partNumber = listingFieldValue(message, /(?:رقم\s*القطعة|part\s*number)/i, 100)
  const oemNumber = listingFieldValue(message, /(?:OEM\s*رقم|رقم\s*OEM|oem\s*number|oem)/i, 100)
  const searchAliases = listingFieldValue(message, /(?:أسماء\s*بحث(?:\s*إضافية)?|مرادفات\s*البحث|search\s*aliases|aliases)/i, 500)
  const fitmentNotes = listingFieldValue(message, /(?:ملاحظات\s*التوافق|fitment\s*notes)/i, 1000)
  const image = message.match(/https:\/\/[^\s،,؟?؛;]+/i)?.[0]?.slice(0, 500)
  const universal = /(?:توافق\s*(?:عام|مع\s*(?:كل|جميع))|متوافق\s+مع\s*(?:كل|جميع)\s*(?:السيارات|العربيات|vehicles?|cars?)|universal|all\s+(?:cars?|vehicles?))/i.test(message)
    ? true
    : /(?:ليس\s+عام(?:اً|ا)?|غير\s+متوافق\s+مع\s*(?:كل|جميع)|not\s+universal)/i.test(message) ? false : undefined
  return { ...(name ? { name } : {}), ...(description ? { description } : {}), ...(category ? { category } : {}), ...(brand ? { brand } : {}), ...(condition ? { condition } : {}), ...(partNumber ? { partNumber } : {}), ...(oemNumber ? { oemNumber } : {}), ...(searchAliases ? { searchAliases } : {}), ...(fitmentNotes ? { fitmentNotes } : {}), ...(image ? { image } : {}), ...(universal !== undefined ? { universal } : {}) }
}

function entityReference(message: string, selected: string | undefined, removals: RegExp): Pick<AIProposalInput, 'entityName'> {
  const cleaned = cleanSubject(message, [removals, /(?:^|\s)(?:the|of|my)(?=\s|$)/gi])
    .replace(/\bengin\b/gi, 'engine')
  return { entityName: selected || cleaned || undefined }
}

function queryUnlessRecency(message: string, kindWords: RegExp) {
  const rawQuery = cleanSubject(message, [/(?:اعرض|هات|شوف|ابحث|دور|show|find|search|list|my|لي|عن)/gi, kindWords, /(?:آخر|أحدث|جديد|أقدم|أول|last|latest|newest|oldest|first)/gi, /\b\d+\b/g])
  const query = rawQuery.split(/\s+/).filter((token) => token.length > 2 || /^[A-Za-z0-9_-]{2,}$/.test(token)).join(' ')
  return query ? { query: query.slice(0, 160) } : {}
}

function cleanSubject(message: string, removals: RegExp[]) {
  let value = message
  for (const removal of removals) value = value.replace(removal, ' ')
  return value.replace(/["'؟?،,:]/g, ' ').replace(/\s+/g, ' ').trim()
}

function recency(message: string): 'latest' | 'oldest' { return /(?:أقدم|أول|oldest|first)/i.test(message) ? 'oldest' : 'latest' }
function requestedLimit(message: string, fallback: number) { const value = integerAfter(message, /(?:آخر|أحدث|أقدم|أول|اعرض|عدد|limit|show|latest|oldest|first)/i); return value ? Math.max(1, Math.min(20, value)) : fallback }
function numberAfter(message: string, marker: RegExp) { const match = message.match(new RegExp(`${marker.source}\\s*(?:إلى|الى|to|=|:)?\\s*(\\d+(?:[.,]\\d+)?)`, 'i')); return match ? Number(match[1].replace(',', '.')) : undefined }
function integerAfter(message: string, marker: RegExp) { const value = numberAfter(message, marker); return value === undefined ? undefined : Math.floor(value) }
function integerBeforeOrAfter(message: string, marker: RegExp) { const after = integerAfter(message, marker); if (after !== undefined) return after; const match = message.match(new RegExp(`(\\d+)\\s*${marker.source}`, 'i')); return match ? Number(match[1]) : undefined }
function dimensionRating(message: string, marker: RegExp) {
  const value = integerBeforeOrAfter(message, marker)
  return value !== undefined && value >= 1 && value <= 5 ? value : undefined
}
function percentageAfter(message: string, marker: RegExp) {
  const direct = numberAfter(message, marker)
  const match = message.match(/([+-]?\d+(?:[.,]\d+)?)\s*%/i)
  const value = direct ?? (match ? Number(match[1].replace(',', '.')) : undefined)
  if (value === undefined) return undefined
  return /(?:خفض|قلل|نقص|decrease)/i.test(message) ? -Math.abs(value) : value
}
function signedIntegerAfter(message: string, marker: RegExp) {
  const match = message.match(new RegExp(marker.source + '\\s*(?:هم|ها|ه|إلى|الى|to|بمقدار|بـ|=|:)?\\s*([+-]?\\d+)', 'i'))
  if (!match) return undefined
  const value = Number(match[1])
  return /(?:نقص|قلل|decrease|خفض)/i.test(message) ? -Math.abs(value) : Math.abs(value)
}
function profilePhone(message: string) {
  return message.match(/(?:الهاتف|هاتف|رقمي|phone|mobile|tel)\s*(?:إلى|الى|to|=|:)?\s*([+\d][\d\s()-]{7,})/i)?.[1]?.replace(/[\s()-]/g, '')
}
function isEnglish(message: string) { return /[A-Za-z]/.test(message) && !/[\u0600-\u06FF]/.test(message) }

function greeting(role: AIRole, english: boolean) {
  if (english) return role === 'SHOP_OWNER' ? 'Hi! I can instantly check your listings, stock, orders, coupons, messages, reviews, pricing, and store performance. Tell me what you need.' : role === 'ADMIN' ? 'Hi! I can instantly show platform statistics and safely look up users, stores, parts, orders, reports, verifications, and disputes.' : 'Hi! I can instantly search parts and stores, check your account, orders, cart, and favorite stores. What do you need?'
  return role === 'SHOP_OWNER' ? 'أهلاً! أقدر فوراً أراجع قطع متجرك والمخزون والطلبات والكوبونات والرسائل والتقييمات والأسعار والأداء. قل لي ما الذي تحتاجه.' : role === 'ADMIN' ? 'أهلاً! أقدر فوراً أعرض إحصاءات المنصة وأبحث بأمان عن المستخدمين والمتاجر والقطع والطلبات والبلاغات والتوثيقات والنزاعات.' : 'أهلاً! أقدر فوراً أبحث عن القطع والمتاجر وأراجع حسابك وطلباتك وسلتك والقطع المتوافقة. ماذا تحتاج؟'
}

function help(role: AIRole, english: boolean) {
  if (english) return role === 'SHOP_OWNER'
    ? '**Instant, no-AI-credit commands**\n- Store performance, revenue, low stock, and weakest products\n- Listings, orders, coupons, customer messages, and reviews\n- Price suggestions based on comparable marketplace listings\n- Safe price/stock/coupon changes with confirmation\n- Marketplace and current web searches\n\nTry: “Show my latest 10 orders” or “Suggest a price for Bosch brake pads”.'
    : role === 'ADMIN'
      ? '**Instant, no-AI-credit commands**\n- Platform totals, completed-order value, open reports, and disputes\n- Look up users, stores, parts, orders, reports, verifications, and disputes\n- Prepare protected moderation actions with confirmation\n- Marketplace and current web searches\n\nTry: “Show the latest open report” or “Show platform statistics”.'
      : '**Instant, no-AI-credit commands**\n- Search marketplace parts and stores\n- Review your cart, recent orders, and favorite stores\n- Add a part to cart or manage favorites with confirmation\n- Search current prices and specifications on the web\n\nTry: “Show my account summary” or “Find brake pads for a BMW motor”.'
  return role === 'SHOP_OWNER'
    ? '**أوامر فورية لا تستهلك رصيد AI**\n- أداء المتجر والمبيعات والمخزون المنخفض وأضعف المنتجات\n- القطع والطلبات والكوبونات ورسائل العملاء والتقييمات\n- اقتراح سعر من عروض مشابهة داخل السوق\n- تجهيز تغيير السعر أو المخزون أو كوبون مع تأكيدك\n- البحث داخل غيار ماركت والبحث الحالي على الويب\n\nجرّب: «اعرض أحدث 10 طلبات» أو «اقترح سعر تيل فرامل Bosch».'
    : role === 'ADMIN'
      ? '**أوامر فورية لا تستهلك رصيد AI**\n- أعداد المنصة وقيمة الطلبات المكتملة والبلاغات والنزاعات المفتوحة\n- البحث عن المستخدمين والمتاجر والقطع والطلبات والبلاغات والتوثيقات والنزاعات\n- تجهيز إجراءات الإدارة المحمية مع تأكيدك\n- البحث داخل السوق وعلى الويب\n\nجرّب: «اعرض أحدث بلاغ مفتوح» أو «اعرض إحصاءات المنصة».'
      : '**أوامر فورية لا تستهلك رصيد AI**\n- البحث عن القطع والمتاجر داخل غيار ماركت\n- مراجعة السلة والطلبات الحديثة والمتاجر المفضلة\n- إضافة قطعة للسلة أو إدارة المفضلة مع تأكيدك\n- البحث عن الأسعار والمواصفات الحالية على الويب\n\nجرّب: «اعرض ملخص حسابي» أو «ابحث عن تيل فرامل لمحرك BMW».'
}
