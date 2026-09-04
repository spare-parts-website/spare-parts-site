import { planDeterministicRequest as basePlanDeterministicRequest } from './deterministic.ts'
import type { AIRole } from './types.ts'

export type { DeterministicRequest } from './deterministic.ts'
export {
  deterministicToolInput,
  accountFocus,
  sellerInsightFocus,
  adminInsightFocus,
  sellerListingState,
  sellerOrderStatus,
  sellerCouponState,
  sellerMessageState,
} from './deterministic.ts'

const GREETING = /^(?:hi|hello|hey|أهلا|اهلا|أهلًا|مرحبا|مرحباً|السلام عليكم|صباح الخير|مساء الخير)[!.,،؟?\s]*$/i
const META_HELP = /^(?:(?:hi|hello|hey|أهلا|اهلا|أهلًا|مرحبا|مرحباً)[,!،.؟?\s]*)?(?:(?:(?:can|could|would)\s+(?:you\s+)?)?help(?:\s+me)?(?:\s+please)?|what\s+can\s+you\s+do|what\s+are\s+your\s+capabilit(?:y|ies)|how\s+(?:do|can)\s+i\s+use\s+(?:you|this|the\s+assistant)|مساعدة|ساعدني|ماذا\s+تستطيع|ماذا\s+تقدر\s+تعمل|تقدر\s+تساعد|بتعمل\s+(?:ايه|إيه)|ما\s+هي\s+قدراتك|كيف\s+استخدمك)[!.,،؟?\s]*$/i
const LEGACY_HELP_TRIGGER = /(?:ماذا تستطيع|تقدر تعمل|تقدر تساعد|بتعمل ايه|بتعمل إيه|الأوامر|مساعدة|ساعدني|help|what can you do|capabilit|how (?:do|can) i use)/i
const CREATE_ACCOUNT = /(?:\b(?:create|make|open|register|sign\s*up|signup)\b.{0,40}\baccount\b|\baccount\b.{0,40}\b(?:create|make|register|sign\s*up|signup)\b|\b(?:register|signup|sign\s*up)\b|(?:إنشاء|انشاء|اعمل|عمل|سجل|تسجيل).{0,24}(?:حساب)|(?:حساب).{0,24}(?:جديد|إنشاء|انشاء|تسجيل))/i
const SIGN_IN = /(?:\b(?:log\s*in|login|sign\s*in)\b|تسجيل\s+الدخول|سجل\s+الدخول|دخول\s+الحساب)/i
const PASSWORD_RECOVERY = /(?:\b(?:forgot|reset|recover|lost)\b.{0,32}\bpassword\b|\bpassword\b.{0,32}\b(?:forgot|reset|recover)\b|نسيت.{0,24}(?:كلمة\s+المرور|الباسورد)|(?:استعادة|إعادة\s+تعيين|اعادة\s+تعيين).{0,24}(?:كلمة\s+المرور|الباسورد))/i

type PlanInput = Parameters<typeof basePlanDeterministicRequest>[0]
type PlanResult = ReturnType<typeof basePlanDeterministicRequest>

/**
 * Guard the mature deterministic parser from broad conversational shortcuts.
 * The old HELP regex intentionally lived before forced tools, which meant a
 * task like "help me create an account" was swallowed by the generic help
 * response. This wrapper handles genuine meta-help/auth intents first and
 * removes help-filler before delegating task-specific requests.
 */
export function planDeterministicRequest(input: PlanInput): PlanResult {
  const message = normalize(input.message)
  if (!message) return undefined

  if (PASSWORD_RECOVERY.test(message)) return { kind: 'answer', answer: passwordRecoveryAnswer(isEnglish(message)) }
  if (CREATE_ACCOUNT.test(message)) return { kind: 'answer', answer: createAccountAnswer(input.role, isEnglish(message)) }
  if (SIGN_IN.test(message)) return { kind: 'answer', answer: signInAnswer(input.role, isEnglish(message)) }
  if (GREETING.test(message)) return { kind: 'answer', answer: greeting(input.role, isEnglish(message)) }
  if (META_HELP.test(message)) return { kind: 'answer', answer: help(input.role, isEnglish(message)) }

  const delegatedMessage = LEGACY_HELP_TRIGGER.test(message) ? removeHelpFiller(message) : message
  return basePlanDeterministicRequest({ ...input, message: delegatedMessage || message })
}

function removeHelpFiller(message: string) {
  return normalize(message
    .replace(/^(?:(?:hi|hello|hey)[,!\s]*)?(?:(?:can|could|would|will)\s+(?:you\s+)?)?(?:please\s+)?help(?:\s+me)?(?:\s+(?:to|with|in|on))?/i, ' ')
    .replace(/^(?:i\s+(?:need|want)\s+help)(?:\s+(?:to|with|in|on))?/i, ' ')
    .replace(/^(?:(?:أهلا|اهلا|مرحبا|ممكن|هل)\s*)?(?:(?:تقدر|تستطيع)\s*)?(?:تساعدني|ساعدني|مساعدة)(?:\s+(?:في|على|بـ|أن|اني))?/i, ' ')
    .replace(/what\s+can\s+you\s+do/gi, ' ')
    .replace(/how\s+(?:do|can)\s+i\s+use/gi, ' ')
    .replace(/capabilit(?:y|ies)/gi, ' ')
    .replace(/\bhelp(?:ful|ing)?\b/gi, ' ')
    .replace(/(?:ماذا\s+تستطيع|تقدر\s+تعمل|تقدر\s+تساعد|بتعمل\s+(?:ايه|إيه)|الأوامر|مساعدة|ساعدني)/gi, ' '))
}

function createAccountAnswer(role: AIRole, english: boolean) {
  if (role !== 'GUEST') return english
    ? 'You are already signed in. Registration for a separate account: [Create account](/register).'
    : 'أنت مسجل الدخول بالفعل. تسجيل حساب منفصل: [إنشاء حساب](/register).'
  return english
    ? 'Yes. You can create either a buyer or shop-owner account. Registration page: [Create account](/register). Enter your name, email and a password of at least 8 characters, then verify the 4-digit code sent to your email. Phone number and profile photo are optional.'
    : 'نعم. يمكنك إنشاء حساب مشتري أو صاحب متجر. صفحة التسجيل: [إنشاء حساب](/register). أدخل الاسم والبريد الإلكتروني وكلمة مرور من 8 أحرف على الأقل، ثم أكّد رمز التحقق المكوّن من 4 أرقام المرسل إلى بريدك. رقم الهاتف وصورة الحساب اختياريان.'
}

function signInAnswer(role: AIRole, english: boolean) {
  if (role !== 'GUEST') return english ? 'You are already signed in.' : 'أنت مسجل الدخول بالفعل.'
  return english ? 'Sign-in page: [Sign in](/login).' : 'صفحة تسجيل الدخول: [تسجيل الدخول](/login).'
}

function passwordRecoveryAnswer(english: boolean) {
  return english
    ? 'Password recovery page: [Reset password](/forgot-password). Enter your account email there to continue.'
    : 'صفحة استعادة كلمة المرور: [إعادة تعيين كلمة المرور](/forgot-password). أدخل بريد حسابك هناك للمتابعة.'
}

function greeting(role: AIRole, english: boolean) {
  if (english) {
    if (role === 'GUEST') return 'Hi! I can search public parts and stores, check listed compatibility, compare marketplace results, look up current web information, and help with registration or sign-in. What do you need?'
    if (role === 'BUYER') return 'Hi! I can search parts and stores, check compatibility, review your orders, cart and favorite stores, and prepare supported changes for your confirmation. What do you need?'
    if (role === 'SHOP_OWNER') return 'Hi! I can review your listings, stock, orders, coupons, messages, reviews, pricing and store performance, with confirmation for real changes. What do you need?'
    return 'Hi! I can show platform statistics, look up supported records, and prepare protected moderation actions for confirmation. What do you need?'
  }
  if (role === 'GUEST') return 'أهلاً! أقدر أبحث في القطع والمتاجر العامة، أراجع بيانات التوافق المسجلة، أقارن النتائج، أبحث عن معلومات حديثة على الويب، وأساعدك في التسجيل أو تسجيل الدخول. ماذا تحتاج؟'
  if (role === 'BUYER') return 'أهلاً! أقدر أبحث عن القطع والمتاجر، أراجع التوافق وطلباتك وسلتك والمتاجر المفضلة، وأجهز التغييرات المدعومة لتأكيدك. ماذا تحتاج؟'
  if (role === 'SHOP_OWNER') return 'أهلاً! أقدر أراجع قطع متجرك والمخزون والطلبات والكوبونات والرسائل والتقييمات والأسعار والأداء، وأطلب تأكيدك قبل أي تغيير حقيقي. ماذا تحتاج؟'
  return 'أهلاً! أقدر أعرض إحصاءات المنصة، أبحث في السجلات المدعومة، وأجهز إجراءات الإدارة المحمية لتأكيدك. ماذا تحتاج؟'
}

function help(role: AIRole, english: boolean) {
  if (english) {
    if (role === 'GUEST') return 'I can search public marketplace parts and stores, check listed compatibility, compare visible listings, look up changing prices/specifications on the web, explain how Ghyar Market works, and guide you through registration or sign-in. Tell me the task directly.'
    if (role === 'BUYER') return 'I can search parts and stores, check compatibility, review your recent orders, cart and favorite stores, use current web information, and prepare supported account/cart/favorite actions for your confirmation. Tell me the task directly.'
    if (role === 'SHOP_OWNER') return 'I can review store performance, listings, inventory, orders, coupons, messages and reviews; compare marketplace pricing; search current web information; and prepare supported store changes for confirmation. Tell me the task directly.'
    return 'I can show platform statistics, look up supported users/stores/parts/orders/reports/verifications/disputes, search current information, and prepare protected moderation changes for confirmation. Tell me the task directly.'
  }
  if (role === 'GUEST') return 'أقدر أبحث في القطع والمتاجر العامة، أراجع بيانات التوافق المسجلة، أقارن العروض الظاهرة، أبحث عن الأسعار والمواصفات المتغيرة على الويب، أشرح استخدام غيار ماركت، وأرشدك للتسجيل أو تسجيل الدخول. اكتب المهمة التي تريدها مباشرة.'
  if (role === 'BUYER') return 'أقدر أبحث عن القطع والمتاجر، أراجع التوافق وطلباتك الحديثة وسلتك والمتاجر المفضلة، أستخدم معلومات الويب الحديثة، وأجهز إجراءات الحساب والسلة والمفضلة المدعومة لتأكيدك. اكتب المهمة مباشرة.'
  if (role === 'SHOP_OWNER') return 'أقدر أراجع أداء المتجر والقطع والمخزون والطلبات والكوبونات والرسائل والتقييمات، أقارن الأسعار داخل السوق، أبحث عن معلومات حديثة، وأجهز تغييرات المتجر المدعومة لتأكيدك. اكتب المهمة مباشرة.'
  return 'أقدر أعرض إحصاءات المنصة، أبحث في المستخدمين والمتاجر والقطع والطلبات والبلاغات والتوثيقات والنزاعات المدعومة، أبحث عن معلومات حديثة، وأجهز إجراءات الإدارة المحمية لتأكيدك. اكتب المهمة مباشرة.'
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isEnglish(value: string) {
  return /[A-Za-z]/.test(value) && !/[\u0600-\u06FF]/.test(value)
}
