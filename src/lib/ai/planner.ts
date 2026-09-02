import type { AIRequestPlan, AIRole, AIToolName } from '@/lib/ai/types'
import type { AIConversationContext } from '@/lib/ai/context'
import { capabilitiesForTools } from './structured-planner.ts'
import { isExplicitFitmentRequest, isMarketplaceAvailabilityRequest, isMarketplaceTerm, isPartsBrowseRequest, isPurchaseRequest } from './normalization.ts'

const ACTION = /(?:^|[\s،,.])(?:غي[ّ]?ر|عد[ّ]?ل|حد[ّ]?ث|زو[ّ]?د|قل[ّ]?ل|أضف|اضف|ضيف|حط|شيل|احذف|افرغ|أفرغ|فضي|فاضي|الغ[ِ]?|إلغاء|ارجع|استلم|وافق|ارفض|اشحن|احظر|وث[ّ]?ق|حل النزاع|اقفل|اغلق|أغلق|اعلق|اعمل|ابعت|ابعث|ارسل|إرسال|send|submit|change|update|set|add|remove|clear|empty|cancel|return|ship|approve|reject|block|verify|close|closed|resolve|resolved)(?=$|[\s،,.])/i
const CURRENT = /(?:سعر|بكام|كام|متاح|توفر|مواصفات|خبر|جديد|أحدث|اليوم|حالي|price|cost|how much|available|availability|specs?|latest|current|news|new model)/i
const NAVIGATION = /(?:افتح|روح|وديني|صفحة|open|go to|navigate)/i
// “سيارة BMW للبيع؟” is a marketplace query. Compatibility is selected only
// when the user actually asks whether a part fits/works with a vehicle.
const COMPARE = /(?:قارن|مقارنة|مقارنه|compare)/i
const MARKETPLACE = /(?:دور|ابحث|فتش|عايز|أريد|اريد|هات|للبيع|بيع|موجود|متاح|اعرض|عرض|شراء|اشتري|عداد|محرك|موتور|فرامل|تيل|فلتر|كشاف|طلمبة|جنط|جنوط|engine|engin|motor|moter|brake|part|parts?|offer|listing|sale|for sale|find|search|wheel|whell|rim)/i
const CHECKOUT = /(?:جهز(?:لي)?\s*(?:ال)?طلب|اطلب\s*(?:ال)?قطع|إتمام\s*(?:ال)?طلب|checkout|place\s+(?:the\s+)?order|buy\s+(?:the\s+)?items?)/i
const SELLER_PRICE = /(?:اقترح|نصيحة|مناسب).*(?:سعر)|(?:سعر).*(?:اقترح|نصيحة|مناسب)|price advice|suggest.*price/i
const ANALYTICS = /(?:تحليل|أداء|إحصائ|مبيعات|إيراد|ايراد|قيمة الطلبات|متوسط(?:\s+ال)?تقييم|مخزون(?:ها|ه|ي)?\s+(?:قليل|منخفض)|نفد|خلص|ناقص|ملخص|analytics|performance|statistics|insights|low stock|out of stock|revenue|average rating)/i
const RECORDS = /(?:طلب|طلبات|رسال|رسائ|كوبون|تقييم|قطعة|قطع|مخزون|order|message|coupon|offer|review|listing|stock)|(?:^|\s)(?:عرض|عروض)(?=\s|$)/i
const ADMIN_RECORDS = /(?:مستخدم|متجر|بلاغ|توثيق|نزاع|طلب|قطعة|user|store|report|verification|dispute|order|part)/i
const ADMIN_REVIEWS = /(?:تقييم(?:ات)?|مراجعة التقييم|review|reviews|rating|ratings)/i
const ADMIN_EMAIL = /(?:بريد|email|spam|سبام|bounce|ارتداد|complain|شكوى بريد|تسليم البريد|deliverability)/i
const ADMIN_MODERATION = /(?:مركز المراجعة|التكرار|مكرر|duplicate|suspicious|مشبوه|سجل التدقيق|audit log|المرفقات العامة|storage)/i
const SELLER_VERIFICATION = /(?:حالة|طلب|طلبات)?\s*(?:توثيق|اعتماد|verification|verified)\s*(?:متجري|المتجر|store|shop)?/i
const DRAFT = /(?:اكتب|جهز|حض[ّ]?ر|صياغة|وصف|رد|مسودة|draft|write|reply|description)/i
const GREETING = /^(?:hi|hello|hey|أهلا|اهلا|أهلًا|مرحبا|مرحباً|السلام عليكم|صباح الخير|مساء الخير)[!.,،؟?\s]*$/i

export function planAIRequest(message: string, role: AIRole, context?: AIConversationContext): AIRequestPlan {
  const text = message.replace(/\s+/g, ' ').trim()
  const tools = new Set<AIToolName>()
  let intent = 'conversation'
  let forcedTool: AIToolName | undefined
  const supportReplyRequest = /(?:رد|reply|answer|ابعت الرد|send the reply).*(?:عليهم|له|لها|التذكرة|الدعم|support)|(?:رد|reply|answer|ابعت الرد|send the reply)$/i.test(text)
  const actionRequest = (ACTION.test(text) || supportReplyRequest || /(?:افتح|open).*(?:تذكرة|الدعم|support|نزاع|dispute)/i.test(text)) && !/(?:غير\s*(?:ال)?مقروء|not read|unread)/i.test(text)
  const hasPreviousResults = Boolean(context && (context.previousSearch || context.previousToolResults.length || context.previousEntities?.length))
  const contextualShow = Boolean(hasPreviousResults && (isPartsBrowseRequest(text) || /^(?:اعرضهم|اعرضها|ورينيهم|show them)$/i.test(text)))
  const contextualCompare = Boolean(hasPreviousResults && COMPARE.test(text))
  const hasContextEntity = Boolean(context?.selectedEntity || hasPreviousResults)
  const purchaseRequest = isPurchaseRequest(text)
  const selectedEntityFollowup = Boolean(context?.selectedEntity && /(?:اخترت|اختيار|selected|choice)/i.test(text))
  const contextualPurchase = Boolean((hasPreviousResults || context?.selectedEntity) && purchaseRequest && !actionRequest)
  const contextualEntityRequest = Boolean(hasContextEntity && /(?:ده|دي|هذا|هذه|هو|هي|it|this|the one|السعر|سعره|بكام|كام|how much|منه|منها|له|لها|من انهي متجر|which store|التاني|الثاني|الأول|الاول|first|second)/i.test(text))
  const roleRecordRequest = (role === 'SHOP_OWNER' && RECORDS.test(text)) || (role === 'ADMIN' && ADMIN_RECORDS.test(text)) || (role !== 'GUEST' && /(?:حسابي|طلباتي|مفضل|السلة|account|my orders|wishlist|cart)/i.test(text))
  const explicitWebSearch = /(?:الإنترنت|الانترنت|الويب|على الويب|web|internet|online|worldwide|global|external|خارج غيار ماركت)/i.test(text)
  const marketplaceRequest = MARKETPLACE.test(text) || isMarketplaceTerm(text) || isMarketplaceAvailabilityRequest(text) || /(?:قطعة|قطع|متجر|عرض|للبيع|المخزون|غيار ماركت|part|parts|store|offer|listing)/i.test(text)
  const liveSearch = (explicitWebSearch || (CURRENT.test(text) && !marketplaceRequest)) && !actionRequest && !roleRecordRequest && !contextualEntityRequest && !CHECKOUT.test(text) && !/(?:متجري|حسابي|طلباتي|المخزون|المنصة|غيار ماركت|رسال|عميل|(?:في|داخل) المتجر|my store|my account|my orders|inventory|platform|message|customer|in (?:my|the) store)/i.test(text)
  const asksForAnalysis = /(?:حل[ّ]?ل|تحليل|أداء|إحصائ|analytics|analy[sz]e|performance|statistics|insights)/i.test(text)
    || /(?:كم|كام|عدد|إجمالي|اجمالي|how many|total number)/i.test(text)
  const sellerMessageWorkflow = role === 'SHOP_OWNER' && /(?:رسال|message)/i.test(text) && /(?:رد|reply|answer)/i.test(text)
  const supportRead = !actionRequest && (/(?:تذاكر الدعم|رد الدعم|support tickets?|support replies?)/i.test(text) || Boolean(context?.currentPage?.dashboard === 'support' && hasPreviousResults && /(?:افتح|open|اعرض|show|شوف|هات)/i.test(text)))
  const disputeRead = role === 'BUYER' && !actionRequest && /(?:نزاع|نزاعات|dispute|disputes)/i.test(text)
  const sellerVerificationRead = role === 'SHOP_OWNER' && !actionRequest && SELLER_VERIFICATION.test(text)

  if (sellerMessageWorkflow) {
    intent = 'seller_message_workflow'
    tools.add('resolveSellerRecord')
    tools.add('getSellerWorkspace')
    tools.add('prepareDraft')
    if (/(?:سعر|price|خصم|discount)/i.test(text)) tools.add('suggestSellerPrice')
    if (actionRequest || /(?:رد|reply|answer|تأكيد|confirm)/i.test(text)) tools.add('prepareAction')
  } else if (supportRead && role === 'ADMIN') {
    intent = 'admin_support'
    tools.add('getAdminSupportTickets')
    forcedTool = 'getAdminSupportTickets'
  } else if (supportRead && role !== 'GUEST') {
    intent = 'support'
    tools.add('getSupportTickets')
    forcedTool = 'getSupportTickets'
  } else if (disputeRead) {
    intent = 'buyer_disputes'
    tools.add('getBuyerDisputes')
    forcedTool = 'getBuyerDisputes'
  } else if (sellerVerificationRead) {
    intent = 'seller_verification'
    tools.add('getSellerVerification')
    forcedTool = 'getSellerVerification'
  } else if (role === 'ADMIN' && !actionRequest && ADMIN_EMAIL.test(text)) {
    intent = 'admin_email_deliverability'
    tools.add('getAdminEmailDeliverability')
    forcedTool = 'getAdminEmailDeliverability'
  } else if (role === 'ADMIN' && !actionRequest && ADMIN_MODERATION.test(text)) {
    intent = 'admin_moderation'
    tools.add('getAdminModeration')
    forcedTool = 'getAdminModeration'
  } else if (role === 'ADMIN' && !actionRequest && ADMIN_REVIEWS.test(text)) {
    intent = 'admin_reviews'
    tools.add('getAdminReviews')
    forcedTool = 'getAdminReviews'
  } else if (role !== 'GUEST' && CHECKOUT.test(text)) {
    intent = 'checkout_preview'
    tools.add('getCheckoutPreview')
    forcedTool = 'getCheckoutPreview'
  } else if (isPartsBrowseRequest(text) && !hasPreviousResults) {
    intent = 'navigation'
    tools.add('navigate')
    forcedTool = 'navigate'
  } else if ((contextualPurchase || selectedEntityFollowup) && (role === 'BUYER' || role === 'SHOP_OWNER')) {
    // A purchase follow-up is resolved against the last server-backed result.
    // An ordinal/selected entity can go straight to a protected proposal;
    // otherwise re-render the same choices so the user has a real button.
    const explicitEntity = selectedEntityFollowup || /(?:الأول|الاول|التاني|الثاني|الثالث|first|second|third|this|the one)/i.test(text)
    intent = explicitEntity ? 'protected_action' : 'marketplace_selection'
    tools.add(explicitEntity ? 'prepareAction' : 'searchMarketplace')
    forcedTool = explicitEntity ? 'prepareAction' : 'searchMarketplace'
  } else if (selectedEntityFollowup && role === 'GUEST') {
    // Guests can inspect public results but cannot prepare cart mutations. Keep
    // a selected result out of a second, unrelated search and offer an explicit
    // sign-in navigation card instead.
    intent = 'navigation'
    tools.add('navigate')
    forcedTool = 'navigate'
  } else if (liveSearch) {
    intent = 'web_search'
    tools.add('searchInternet')
    forcedTool = 'searchInternet'
  } else if (GREETING.test(text)) {
    intent = 'greeting'
  } else if (role === 'SHOP_OWNER' && asksForAnalysis && (ANALYTICS.test(text) || RECORDS.test(text))) {
    // Composite requests often continue with a price/offer suggestion. Start with
    // authoritative store data instead of forcing a one-step generative action.
    intent = 'seller_insights'
    tools.add('getSellerInsights')
    forcedTool = 'getSellerInsights'
  } else if (role === 'ADMIN' && asksForAnalysis && (ANALYTICS.test(text) || ADMIN_RECORDS.test(text))) {
    intent = 'admin_insights'
    tools.add('getAdminInsights')
    forcedTool = 'getAdminInsights'
  } else if (actionRequest) {
    intent = 'protected_action'
    tools.add('prepareAction')
    forcedTool = 'prepareAction'
  } else if (NAVIGATION.test(text)) {
    intent = 'navigation'
    tools.add('navigate')
    forcedTool = 'navigate'
  } else if (DRAFT.test(text)) {
    intent = 'draft'
    tools.add('prepareDraft')
    forcedTool = 'prepareDraft'
    if (role === 'SHOP_OWNER' && /(?:رسالة|رد|message|reply)/i.test(text)) tools.add('resolveSellerRecord')
  } else if (role === 'SHOP_OWNER' && SELLER_PRICE.test(text)) {
    intent = 'seller_pricing'
    tools.add('suggestSellerPrice')
    forcedTool = 'suggestSellerPrice'
  } else if (role === 'SHOP_OWNER' && ANALYTICS.test(text)) {
    intent = 'seller_insights'
    tools.add('getSellerInsights')
    forcedTool = 'getSellerInsights'
  } else if (role === 'SHOP_OWNER' && RECORDS.test(text)) {
    intent = 'seller_workspace'
    tools.add('getSellerWorkspace')
    forcedTool = 'getSellerWorkspace'
  } else if (role === 'ADMIN' && ANALYTICS.test(text)) {
    intent = 'admin_insights'
    tools.add('getAdminInsights')
    forcedTool = 'getAdminInsights'
  } else if (role === 'ADMIN' && ADMIN_RECORDS.test(text)) {
    intent = 'admin_lookup'
    tools.add('lookupAdminRecords')
    forcedTool = 'lookupAdminRecords'
  } else if (contextualCompare || (COMPARE.test(text) && MARKETPLACE.test(text))) {
    intent = 'marketplace_compare'
    tools.add('compareMarketplace')
    forcedTool = 'compareMarketplace'
  } else if (contextualShow) {
    intent = 'marketplace_search'
    tools.add('searchMarketplace')
    forcedTool = 'searchMarketplace'
  } else if (contextualEntityRequest && !isExplicitFitmentRequest(text)) {
    intent = 'marketplace_search'
    tools.add('searchMarketplace')
    forcedTool = 'searchMarketplace'
  } else if (isExplicitFitmentRequest(text)) {
    intent = 'compatibility'
    tools.add('findCompatibleParts')
    forcedTool = 'findCompatibleParts'
  } else if (role !== 'GUEST' && /(?:حسابي|طلباتي|آخر طلب|أحدث طلب|مفضل|السلة|account|my orders|latest order|last order|wishlist|cart)/i.test(text)) {
    intent = 'account_context'
    tools.add('getAccountContext')
    forcedTool = 'getAccountContext'
  } else if (!liveSearch && (MARKETPLACE.test(text) || isMarketplaceTerm(text) || /(?:قطعة|متجر|store)/i.test(text))) {
    intent = 'marketplace_search'
    tools.add('searchMarketplace')
    forcedTool = 'searchMarketplace'
  }

  const heavy = sellerMessageWorkflow || /(?:قارن|حلل بالتفصيل|خطة|كل|شامل|compare|detailed|plan|all|comprehensive)/i.test(text) || text.length > 700
  const standard = heavy || tools.size > 1 || intent === 'protected_action' || liveSearch
  const complexity = heavy ? 'heavy' : standard ? 'standard' : 'quick'
  return {
    complexity,
    intent,
    tools: [...tools],
    forcedTool,
    liveSearch,
    maxSteps: complexity === 'heavy' ? 5 : complexity === 'standard' ? 3 : forcedTool ? 2 : 1,
    timeoutMs: 110_000,
    maxOutputTokens: complexity === 'heavy' ? 650 : complexity === 'standard' ? 420 : 240,
    plannerMode: forcedTool || GREETING.test(text) ? 'deterministic' : 'structured-agent',
    capabilities: capabilitiesForTools([...tools]),
  }
}

export function cleanWebSearchQuery(message: string) {
  const egypt = /(?:\bEgypt\b|\bEgyptian\b|مصر|مصري)/i.test(message)
  const cleaned = message
    .replace(/(?:search|look up|browse)\s+(?:the\s+)?internet[\s\S]*$/gi, ' ')
    .replace(/(?:ابحث|دور)\s+(?:في|على)\s+(?:الإنترنت|الانترنت|الويب)[\s\S]*$/gi, ' ')
    .replace(/(?:من فضلك|لو سمحت|ممكن|عايز أعرف|ابحث لي|دور لي|can you|please|tell me)/gi, ' ')
    .replace(/what is (?:the )?(?:current |latest )?(?:price|cost)(?: in (?:egypt|the egyptian market))? (?:for|of) (?:a|an|the)?/gi, ' ')
    .replace(/how much (?:is|does) (?:a|an|the)?/gi, ' ')
    .replace(/(?:ما هو|ايه|إيه) (?:ال)?سعر (?:الحالي )?(?:في مصر )?(?:لـ|ل)?/gi, ' ')
    .replace(/(?:بكام|كام سعر|كم سعر)\s*/gi, ' ')
    .replace(/\b(?:current|latest)\b/gi, ' ')
    .replace(/(?:حالياً|حاليا|الحالي|الحالية)/gi, ' ')
    .replace(/\b(?:in egypt|egyptian market)\b/gi, ' ')
    .replace(/(?:في مصر|السوق المصري)/gi, ' ')
    .replace(/["'؟?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${cleaned} price${egypt ? ' Egypt EGP' : ''}`.replace(/\s+/g, ' ').trim().slice(0, 160)
}
