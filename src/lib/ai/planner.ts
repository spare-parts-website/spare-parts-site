import type { AIRequestPlan, AIRole, AIToolName } from '@/lib/ai/types'

const ACTION = /(?:^|[\s،,.])(?:غي[ّ]?ر|عد[ّ]?ل|حد[ّ]?ث|زو[ّ]?د|قل[ّ]?ل|أضف|اضف|ضيف|حط|شيل|احذف|الغ[ِ]?|إلغاء|ارجع|استلم|وافق|ارفض|اشحن|احظر|وث[ّ]?ق|حل النزاع|change|update|set|add|remove|cancel|return|ship|approve|reject|block|verify)(?=$|[\s،,.])/i
const CURRENT = /(?:سعر|بكام|كام|متاح|توفر|مواصفات|خبر|جديد|أحدث|اليوم|حالي|price|cost|how much|available|availability|specs?|latest|current|news|new model)/i
const NAVIGATION = /(?:افتح|روح|وديني|صفحة|open|go to|navigate)/i
const COMPATIBILITY = /(?:متوافق|ينفع|يركب|عربيتي|سيارتي|سيارتي الأساسية|compatible|fit|my car)/i
const SELLER_PRICE = /(?:اقترح|نصيحة|مناسب).*(?:سعر)|(?:سعر).*(?:اقترح|نصيحة|مناسب)|price advice|suggest.*price/i
const ANALYTICS = /(?:تحليل|أداء|إحصائ|مبيعات|إيراد|ايراد|قيمة الطلبات|متوسط(?:\s+ال)?تقييم|مخزون(?:ها|ه|ي)?\s+(?:قليل|منخفض)|نفد|خلص|ناقص|ملخص|analytics|performance|statistics|insights|low stock|out of stock|revenue|average rating)/i
const RECORDS = /(?:طلب|طلبات|رسال|رسائ|كوبون|تقييم|قطعة|قطع|مخزون|order|message|coupon|offer|review|listing|stock)|(?:^|\s)(?:عرض|عروض)(?=\s|$)/i
const ADMIN_RECORDS = /(?:مستخدم|متجر|بلاغ|توثيق|نزاع|طلب|قطعة|user|store|report|verification|dispute|order|part)/i
const DRAFT = /(?:اكتب|جهز|حض[ّ]?ر|صياغة|وصف|رد|مسودة|draft|write|reply|description)/i
const GREETING = /^(?:hi|hello|hey|أهلا|اهلا|أهلًا|مرحبا|مرحباً|السلام عليكم|صباح الخير|مساء الخير)[!.,،؟?\s]*$/i

export function planAIRequest(message: string, role: AIRole): AIRequestPlan {
  const text = message.replace(/\s+/g, ' ').trim()
  const tools = new Set<AIToolName>()
  let intent = 'conversation'
  let forcedTool: AIToolName | undefined
  const actionRequest = ACTION.test(text) && !/(?:غير\s*(?:ال)?مقروء|not read|unread)/i.test(text)
  const roleRecordRequest = (role === 'SHOP_OWNER' && RECORDS.test(text)) || (role === 'ADMIN' && ADMIN_RECORDS.test(text)) || (role !== 'GUEST' && role !== 'ADMIN' && /(?:حسابي|طلباتي|مفضل|عربياتي|سياراتي|السلة|account|my orders|wishlist|my cars|cart)/i.test(text))
  const liveSearch = CURRENT.test(text) && !actionRequest && !roleRecordRequest && !/(?:متجري|حسابي|طلباتي|المخزون|المنصة|غيار ماركت|رسال|عميل|(?:في|داخل) المتجر|my store|my account|my orders|inventory|platform|message|customer|in (?:my|the) store)/i.test(text)
  const asksForAnalysis = /(?:حل[ّ]?ل|تحليل|أداء|إحصائ|analytics|analy[sz]e|performance|statistics|insights)/i.test(text)
    || /(?:كم|كام|عدد|إجمالي|اجمالي|how many|total number)/i.test(text)
  const sellerMessageWorkflow = role === 'SHOP_OWNER' && /(?:رسال|message)/i.test(text) && /(?:رد|reply|answer)/i.test(text)

  if (sellerMessageWorkflow) {
    intent = 'seller_message_workflow'
    tools.add('resolveSellerRecord')
    tools.add('getSellerWorkspace')
    tools.add('prepareDraft')
    if (/(?:سعر|price|خصم|discount)/i.test(text)) tools.add('suggestSellerPrice')
    if (actionRequest || /(?:تأكيد|confirm)/i.test(text)) tools.add('prepareAction')
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
  } else if (role !== 'GUEST' && role !== 'ADMIN' && COMPATIBILITY.test(text)) {
    intent = 'compatibility'
    tools.add('findCompatibleParts')
    forcedTool = 'findCompatibleParts'
  } else if (role !== 'GUEST' && role !== 'ADMIN' && /(?:حسابي|طلباتي|آخر طلب|أحدث طلب|مفضل|عربياتي|سياراتي|السيارات المحفوظة|السلة|account|my orders|latest order|last order|wishlist|my cars|saved cars|cart)/i.test(text)) {
    intent = 'account_context'
    tools.add('getAccountContext')
    forcedTool = 'getAccountContext'
  } else if (!liveSearch && /(?:دور|ابحث|عايز|قطعة|متجر|find|search|part|store)/i.test(text)) {
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
