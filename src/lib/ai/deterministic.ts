import { cleanWebSearchQuery } from './planner.ts'
import type { AIClientContext, AIProposalInput, AIRole, AIToolName } from './types.ts'

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
  if (toolName === 'searchInternet') return { query: cleanWebSearchQuery(message) }
  if (toolName === 'searchMarketplace') {
    const query = cleanSubject(message, [
      /(?:دور|ابحث|فتش|عايز|أريد|اريد|هات|find|search|show me|i need|looking for)/gi,
      /(?:^|\s)(?:على|عن|for)(?=\s|$)/gi,
      /(?:في|داخل)\s+(?:غيار ماركت|المتجر|الموقع)/gi,
      /(?:قطعة|قطع غيار|متجر|store|shop|part|parts)/gi,
    ])
    return query ? { query: query.slice(0, 120), limit: requestedLimit(message, 8) } : undefined
  }
  if (toolName === 'findCompatibleParts') {
    const primary = /(?:عربيتي|سيارتي|الأساسية|my (?:primary )?car)/i.test(message)
    const query = cleanSubject(message, [/(?:هل|دور|ابحث|عايز|find|search|compatible|fit|fits|متوافق|ينفع|يركب)/gi, /(?:^|\s)(?:عن|مع|على|لـ?|for|my car|عربيتي|سيارتي|الأساسية)(?=\s|$)/gi])
    return { carDescription: primary ? 'السيارة الأساسية' : message.slice(0, 160), ...(query && query.length < message.length ? { query: query.slice(0, 120) } : {}) }
  }
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

export function accountFocus(message: string): 'overview' | 'orders' | 'cart' | 'cars' | 'favorites' {
  if (/(?:طلباتي|آخر طلب|أحدث طلب|my orders?|last order|latest order)/i.test(message)) return 'orders'
  if (/(?:السلة|cart)/i.test(message)) return 'cart'
  if (/(?:عربياتي|سياراتي|سيارتي|السيارات(?: المحفوظة)?|my cars?|saved cars?)/i.test(message)) return 'cars'
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
  const destinations: Array<[RegExp, string]> = [
    [/(?:الرئيسية|home)/i, 'home'], [/(?:المتاجر|stores)/i, role === 'ADMIN' ? 'admin_stores' : 'stores'], [/(?:السلة|cart)/i, 'cart'],
    [/(?:المفضلة|wishlist)/i, 'wishlist'], [/(?:سياراتي|عربياتي|cars)/i, 'cars'], [/(?:حسابي|الملف|profile)/i, 'profile'],
    ...(role === 'SHOP_OWNER' ? [[/(?:رسائل|messages)/i, 'seller_messages'] as [RegExp, string]] : []),
    [/(?:كوبونات|coupons)/i, 'seller_coupons'], [/(?:تحليل|إحصائ|analytics)/i, 'seller_analytics'],
    [/(?:بلاغات|reports)/i, 'admin_reports'], [/(?:مستخدمين|users)/i, 'admin_users'],
    [/(?:طلبات|orders)/i, role === 'ADMIN' ? 'admin_orders' : role === 'SHOP_OWNER' ? 'seller_orders' : 'orders'],
    [/(?:قطع|منتجات|parts|products)/i, role === 'ADMIN' ? 'admin_parts' : role === 'SHOP_OWNER' ? 'seller_parts' : 'parts'],
    [/(?:متاجر الإدارة|admin stores)/i, 'admin_stores'],
  ]
  const destination = destinations.find(([pattern]) => pattern.test(message))?.[1]
  return destination ? { destination } : undefined
}

function actionInput(message: string, role: AIRole, context: AIClientContext): AIProposalInput | undefined {
  const quantity = integerAfter(message, /(?:كمية|عدد|quantity|qty)/i) || integerAfter(message, /(?:أضف|اضف|add)\s+/i) || 1
  const selectionName = context.selection?.label
  if (/(?:أضف|اضف|ضيف|حط|add).*(?:السلة|cart)/i.test(message)) return { action: 'cart_add', quantity, ...entityReference(message, selectionName, /(?:أضف|اضف|ضيف|حط|add|إلى|الى|في|السلة|cart|quantity|qty|كمية|عدد)/gi) }
  if (/(?:المفضلة|wishlist|favorite)/i.test(message) && /(?:أضف|اضف|add|شيل|احذف|remove)/i.test(message)) {
    const remove = /(?:شيل|احذف|remove)/i.test(message)
    return { action: remove ? 'wishlist_store_remove' : 'wishlist_store_add', storeName: selectionName || cleanSubject(message, [/(?:أضف|اضف|add|شيل|احذف|remove|من|إلى|الى|المفضلة|wishlist|favorite|متجر|store)/gi]) }
  }
  if (/(?:احفظ|أضف|اضف|سجل|save|add).*(?:سيار|عربي|car)/i.test(message)) {
    const year = Number(message.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) || undefined
    const subject = cleanSubject(message, [/(?:احفظ|أضف|اضف|سجل|save|add|سيارة|سيارتي|عربية|عربيتي|car|as primary|أساسية)/gi, /\b(?:19\d{2}|20\d{2})\b/g])
    const [brand, ...modelParts] = subject.split(' ').filter(Boolean)
    if (brand && modelParts.length) return { action: 'car_create', brand, model: modelParts.join(' '), year, isPrimary: /(?:أساسية|primary)/i.test(message) }
  }
  if (/(?:طلب|order)/i.test(message)) {
    const statuses: Array<[RegExp, string]> = [[/(?:إلغاء|الغ|cancel)/i, 'cancel'], [/(?:استلم|deliver)/i, 'deliver'], [/(?:إرجاع|ارجع|return)/i, 'return'], [/(?:وافق|approve)/i, 'approve'], [/(?:ارفض|reject)/i, 'reject'], [/(?:اشحن|ship)/i, 'ship']]
    const status = statuses.find(([pattern]) => pattern.test(message))?.[1]
    if (status) return { action: 'order_action', status, orderDescription: cleanSubject(message, [/(?:إلغاء|الغ|cancel|استلم|deliver|إرجاع|ارجع|return|وافق|approve|ارفض|reject|اشحن|ship|طلب|order)/gi]) || undefined, recency: recency(message) }
  }
  if (role === 'SHOP_OWNER') {
    const price = numberAfter(message, /(?:إلى|الى|to)/i) ?? numberAfter(message, /(?:سعر|price)/i); const stock = integerAfter(message, /(?:مخزون|stock)/i)
    if (/(?:غي[ّ]?ر|عدل|حدث|set|change|update)/i.test(message) && (price !== undefined || stock !== undefined)) return { action: 'seller_part_update', price, stock, ...entityReference(message, selectionName, /(?:غي[ّ]?ر|عدل|حدث|set|change|update|سعر|price|مخزون|stock|إلى|الى|to|جنيه|egp|قطعة|part|\d+(?:[.,]\d+)?)/gi) }
    if (/(?:أنشئ|اعمل|أضف|اضف|create|add).*(?:كوبون|coupon)/i.test(message)) {
      const code = message.match(/(?:كود|كوبون|code|coupon)\s*[:=]?\s*([A-Za-z0-9_-]{3,40})/i)?.[1]?.toUpperCase()
      const discountPercent = integerBeforeOrAfter(message, /(?:%|خصم|discount)/i); const maxUses = integerBeforeOrAfter(message, /(?:استخدام|uses?|مرات)/i)
      return { action: 'seller_coupon_create', code, discountPercent, maxUses }
    }
  }
  if (role === 'ADMIN') {
    if (/(?:احظر|حظر|block|unblock|إلغاء حظر)/i.test(message) && /(?:قطعة|part|product)/i.test(message)) return { action: 'admin_part_block', status: /(?:unblock|إلغاء حظر)/i.test(message) ? 'ACTIVE' : 'BLOCKED', ...entityReference(message, selectionName, /(?:احظر|حظر|block|unblock|إلغاء حظر|قطعة|part|product)/gi) }
    if (/(?:وثق|اعتمد|verify|unverify|إلغاء اعتماد)/i.test(message) && /(?:متجر|store)/i.test(message)) return { action: 'admin_store_verify', status: /(?:unverify|إلغاء اعتماد)/i.test(message) ? 'UNVERIFIED' : 'VERIFIED', storeName: selectionName || cleanSubject(message, [/(?:وثق|اعتمد|verify|unverify|إلغاء اعتماد|متجر|store)/gi]) }
    if (/(?:وافق|approve|ارفض|reject)/i.test(message) && /(?:توثيق|verification)/i.test(message)) return { action: 'admin_verification_decision', status: /(?:ارفض|reject)/i.test(message) ? 'REJECTED' : 'APPROVED', entityName: selectionName || cleanSubject(message, [/(?:وافق|approve|ارفض|reject|طلب|توثيق|verification)/gi]) }
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
function isEnglish(message: string) { return /[A-Za-z]/.test(message) && !/[\u0600-\u06FF]/.test(message) }

function greeting(role: AIRole, english: boolean) {
  if (english) return role === 'SHOP_OWNER' ? 'Hi! I can instantly check your listings, stock, orders, coupons, messages, reviews, pricing, and store performance. Tell me what you need.' : role === 'ADMIN' ? 'Hi! I can instantly show platform statistics and safely look up users, stores, parts, orders, reports, verifications, and disputes.' : 'Hi! I can instantly search parts and stores, check your account, orders, cart, and favorite stores. What do you need?'
  return role === 'SHOP_OWNER' ? 'أهلاً! أقدر فوراً أراجع قطع متجرك والمخزون والطلبات والكوبونات والرسائل والتقييمات والأسعار والأداء. قل لي ما الذي تحتاجه.' : role === 'ADMIN' ? 'أهلاً! أقدر فوراً أعرض إحصاءات المنصة وأبحث بأمان عن المستخدمين والمتاجر والقطع والطلبات والبلاغات والتوثيقات والنزاعات.' : 'أهلاً! أقدر فوراً أبحث عن القطع والمتاجر وأراجع حسابك وطلباتك وسلتك وسياراتك والقطع المتوافقة. ماذا تحتاج؟'
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
