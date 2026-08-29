import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DEFAULT_AI_QUOTAS, maskEmail, maskPhone, roleCanPrepareAction } from '../src/lib/ai/policy.ts'
import { cleanWebSearchQuery, planAIRequest } from '../src/lib/ai/planner.ts'
import { presentAIResponse } from '../src/lib/ai/presentation.ts'
import { accountFocus, adminInsightFocus, deterministicToolInput, planDeterministicRequest, sellerCouponState, sellerInsightFocus, sellerListingState, sellerMessageState, sellerOrderStatus } from '../src/lib/ai/deterministic.ts'
import { presentSellerInventory } from '../src/lib/ai/deterministic-presenters.ts'

const emptyContext = { cart: [] }

test('uses the requested role-specific hourly quotas', () => {
  assert.deepEqual(DEFAULT_AI_QUOTAS, { GUEST: 10, BUYER: 40, SHOP_OWNER: 100, ADMIN: 150 })
})

test('keeps state-changing AI actions behind strict role allowlists', () => {
  assert.equal(roleCanPrepareAction('GUEST', 'cart_add'), false)
  assert.equal(roleCanPrepareAction('BUYER', 'seller_part_update'), false)
  assert.equal(roleCanPrepareAction('SHOP_OWNER', 'seller_part_update'), true)
  assert.equal(roleCanPrepareAction('SHOP_OWNER', 'seller_part_create'), true)
  assert.equal(roleCanPrepareAction('SHOP_OWNER', 'admin_part_block'), false)
  assert.equal(roleCanPrepareAction('ADMIN', 'admin_part_block'), true)
  assert.equal(roleCanPrepareAction('ADMIN', 'seller_coupon_create'), false)
})

test('masks personal contact details before admin AI results are rendered', () => {
  assert.equal(maskEmail('mohamed@example.com'), 'mo***@example.com')
  assert.equal(maskPhone('01012345678'), '010****78')
  assert.equal(maskEmail('invalid'), '***')
})

test('does not register permanent deletion or infrastructure controls as AI actions', () => {
  const types = readFileSync(new URL('../src/lib/ai/types.ts', import.meta.url), 'utf8')
  for (const forbidden of ['delete_user', 'delete_store', 'delete_part', 'sql', 'github', 'vercel', 'resend', 'paymob']) {
    assert.equal(types.includes(`'${forbidden}'`), false)
  }
})

test('confirmation consumes proposals and revalidates ownership and current state', () => {
  const actions = readFileSync(new URL('../src/lib/ai/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /status: 'PROCESSING'/)
  assert.match(actions, /status: 'FAILED'/)
  assert.match(actions, /storeId: store\.id/)
  assert.match(actions, /userId: input\.user\.id/)
  assert.match(actions, /validateAndDescribe\(input\.user, payload\)/)
})

test('server-only AI tables enable RLS and revoke browser roles', () => {
  const migration = readFileSync(new URL('../prisma/ai-assistant.sql', import.meta.url), 'utf8')
  for (const table of ['AIConversation', 'AIMessage', 'AIActionProposal', 'AIRequestLease']) {
    assert.ok(migration.includes(`alter table public."${table}" enable row level security`))
    assert.ok(migration.includes(`revoke all on table public."${table}" from anon, authenticated`))
  }
})

test('plans obvious requests with a narrow forced tool', () => {
  assert.deepEqual(planAIRequest('غير سعر قطعة موتور BMW إلى 2500', 'SHOP_OWNER').tools, ['prepareAction'])
  assert.equal(planAIRequest('غير سعر قطعة موتور BMW إلى 2500', 'SHOP_OWNER').forcedTool, 'prepareAction')
  assert.equal(planAIRequest('حلل أداء متجري', 'SHOP_OWNER').forcedTool, 'getSellerInsights')
  assert.equal(planAIRequest('حلل أداء متجري خلال آخر 30 يوم ثم اقترح سعراً وجهز عرض خصم', 'SHOP_OWNER').forcedTool, 'getSellerInsights')
  assert.equal(planAIRequest('ايه القطع اللي مخزونها قليل؟', 'SHOP_OWNER').forcedTool, 'getSellerInsights')
  assert.equal(planAIRequest('دور على تيل فرامل تويوتا', 'GUEST').forcedTool, 'searchMarketplace')
  assert.equal(planAIRequest('اعرض إحصائيات المنصة', 'ADMIN').forcedTool, 'getAdminInsights')
  assert.equal(planAIRequest('كم سعر BMW 328i serpentine belt حالياً؟', 'GUEST').forcedTool, 'searchInternet')
})

test('automatically reserves more work only for complex requests', () => {
  assert.equal(planAIRequest('أهلاً', 'GUEST').complexity, 'quick')
  assert.equal(planAIRequest('hi', 'SHOP_OWNER').intent, 'greeting')
  assert.equal(planAIRequest('قارن بالتفصيل بين كل نتائج قطع الفرامل', 'BUYER').complexity, 'heavy')
  assert.equal(planAIRequest('كم سعر BMW 328i serpentine belt حالياً؟', 'GUEST').liveSearch, true)
})

test('cleans conversational filler from current web searches', () => {
  assert.equal(cleanWebSearchQuery('Can you please tell me how much is "BMW 328i belt"?'), 'BMW 328i belt price')
  assert.equal(cleanWebSearchQuery('What is the current price in Egypt for a BMW 328i serpentine belt? Search the internet and show me the sources'), 'BMW 328i serpentine belt price Egypt EGP')
  assert.equal(cleanWebSearchQuery('كم سعر BMW 328i belt في مصر حالياً؟'), 'BMW 328i belt price Egypt EGP')
})

test('uses stable Gemini Flash Lite with zero-cost provider failover', () => {
  const runtime = readFileSync(new URL('../src/lib/ai/runtime.ts', import.meta.url), 'utf8')
  const agent = readFileSync(new URL('../src/lib/ai/agent.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  const assistant = readFileSync(new URL('../src/components/ai-assistant.tsx', import.meta.url), 'utf8')
  const imagePolicy = readFileSync(new URL('../src/lib/image-policy.ts', import.meta.url), 'utf8')
  assert.match(runtime, /gemini-3\.5-flash-lite/)
  assert.match(runtime, /'google'[\s\S]*'openrouter-text-pool-a'[\s\S]*'openrouter-text-pool-b'[\s\S]*'openrouter-vision-pool'[\s\S]*'openrouter'[\s\S]*'gateway'/)
  assert.match(agent, /openrouter\/free/)
  assert.match(agent, /inclusionai\/ling-3\.0-flash-fin:free/)
  assert.match(agent, /google\/gemma-4-26b-a4b-it:free/)
  assert.match(agent, /z-ai\/glm-5\.2:free/)
  assert.match(agent, /google\/gemma-4-31b-it:free/)
  assert.match(agent, /nvidia\/nemotron-3\.5-lightning:free/)
  assert.match(agent, /poolside\/laguna-s-2\.1:free/)
  assert.match(agent, /poolside\/laguna-xs-2\.1:free/)
  assert.match(agent, /alibaba\/qwen3-vl-instruct/)
  assert.match(route, /EMPTY_AI_RESPONSE/)
  assert.match(route, /part\.type === 'text' && Boolean\(part\.text\.trim\(\)\)/)
  assert.match(route, /terminalFallback/)
  assert.match(assistant, /requestAgeSeconds < 50/)
  assert.match(assistant, /PromptInputAttachmentsButton/)
  assert.match(assistant, /isAbort.*isDisconnect.*isError/)
  assert.match(assistant, /current\.filter\(\(item\) => item\.id !== message\.id\)/)
  for (const removed of ['stealth/ox-alpha', 'OPENROUTER_FAST_MODEL', 'OPENROUTER_DEEP_MODEL', 'AI_MODE_KEY']) {
    assert.equal(`${runtime}\n${assistant}\n${imagePolicy}`.includes(removed), false)
  }
})

test('plans compound seller message requests with all required tools instead of web search', () => {
  const plan = planAIRequest('ابحث عن آخر رسالة وصلتني واكتب رداً وقارن السعر واعرض التغيير للتأكيد', 'SHOP_OWNER')
  assert.equal(plan.intent, 'seller_message_workflow')
  assert.equal(plan.liveSearch, false)
  for (const tool of ['resolveSellerRecord', 'getSellerWorkspace', 'prepareDraft', 'suggestSellerPrice', 'prepareAction']) assert.ok(plan.tools.includes(tool as never))
  assert.equal(plan.complexity, 'heavy')
})

test('executes safe obvious tools directly without a model', () => {
  const tools = readFileSync(new URL('../src/lib/ai/tools.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  for (const name of ['getAccountContext', 'getSellerInsights', 'getAdminInsights', 'searchMarketplace', 'findCompatibleParts', 'getSellerWorkspace']) assert.match(tools, new RegExp(name))
  assert.match(route, /executeDeterministicAIRequest/)
  assert.match(route, /ai\.deterministic\.completed/)
  assert.match(tools, /buildSellerPerformancePlan/)
  assert.match(tools, /buildSellerMessagePlan/)
  assert.match(route, /ai\.seller_plan\.completed/)
  assert.match(route, /ai\.seller_message_plan\.completed/)
})

test('parses broad Arabic and English commands without a model', () => {
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'اعرض أحدث 7 طلبات', 'SHOP_OWNER', emptyContext), { section: 'orders', recency: 'latest', limit: 7 })
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'show my oldest 5 coupons', 'SHOP_OWNER', emptyContext), { section: 'coupons', recency: 'oldest', limit: 5 })
  assert.deepEqual(deterministicToolInput('searchMarketplace', 'دور على تيل فرامل تويوتا داخل غيار ماركت', 'GUEST', emptyContext), { query: 'تيل فرامل تويوتا', limit: 8 })
  assert.deepEqual(deterministicToolInput('navigate', 'افتح صفحة طلباتي', 'BUYER', emptyContext), { destination: 'orders' })
  assert.deepEqual(deterministicToolInput('lookupAdminRecords', 'اعرض أحدث 3 بلاغات', 'ADMIN', emptyContext), { kind: 'report', recency: 'latest' })
  assert.deepEqual(deterministicToolInput('prepareAction', 'غير سعر تيل فرامل Bosch إلى 2500', 'SHOP_OWNER', emptyContext), { action: 'seller_part_update', price: 2500, stock: undefined, entityName: 'تيل فرامل Bosch' })
})

test('answers the exact requested summary instead of returning a generic dashboard line', () => {
  assert.equal(sellerInsightFocus('ايه القطع اللي مخزونها قليل؟'), 'low_stock')
  assert.equal(sellerInsightFocus('كم عدد الطلبات عندي؟'), 'orders')
  assert.equal(sellerInsightFocus('اعرض إيرادات المتجر'), 'sales')
  assert.equal(sellerInsightFocus('ما متوسط تقييم منتجاتي؟'), 'rating')
  assert.equal(accountFocus('ما هو آخر طلب لي؟'), 'orders')
  assert.equal(accountFocus('اعرض السيارات المحفوظة'), 'cars')
  assert.equal(accountFocus('ماذا يوجد في السلة؟'), 'cart')
  assert.equal(adminInsightFocus('كم بلاغ مفتوح؟'), 'reports')
  assert.equal(adminInsightFocus('ما قيمة الطلبات المكتملة؟'), 'revenue')
  assert.deepEqual(deterministicToolInput('getSellerInsights', 'ايه القطع اللي مخزونها قليل؟', 'SHOP_OWNER', emptyContext), { focus: 'low_stock' })
  assert.equal(planAIRequest('كم عدد الطلبات عندي؟', 'SHOP_OWNER').forcedTool, 'getSellerInsights')
  assert.equal(planAIRequest('كم بلاغ مفتوح؟', 'ADMIN').forcedTool, 'getAdminInsights')
  assert.equal(planAIRequest('اعرض السيارات المحفوظة', 'BUYER').forcedTool, 'getAccountContext')
  assert.deepEqual(deterministicToolInput('getAccountContext', 'اعرض طلباتي قيد الانتظار', 'BUYER', emptyContext), { focus: 'orders', orderStatus: 'PENDING' })
})

test('covers every deterministic tool category with usable structured input', () => {
  const cases = [
    ['searchMarketplace', 'ابحث عن تيل فرامل تويوتا داخل غيار ماركت', 'GUEST'],
    ['searchInternet', 'كم سعر BMW 328i belt في مصر حالياً؟', 'GUEST'],
    ['navigate', 'افتح صفحة طلباتي', 'BUYER'],
    ['prepareDraft', 'اكتب رسالة أسأل فيها عن التوافق', 'BUYER'],
    ['getAccountContext', 'اعرض طلباتي', 'BUYER'],
    ['findCompatibleParts', 'ابحث عن تيل فرامل متوافق مع سيارتي الأساسية', 'BUYER'],
    ['prepareAction', 'أضف تيل فرامل Bosch إلى السلة', 'BUYER'],
    ['getSellerInsights', 'ايه القطع اللي مخزونها قليل؟', 'SHOP_OWNER'],
    ['suggestSellerPrice', 'اقترح سعر تيل فرامل Bosch', 'SHOP_OWNER'],
    ['getSellerWorkspace', 'اعرض أحدث 5 طلبات', 'SHOP_OWNER'],
    ['resolveSellerRecord', 'حدد أحدث رسالة عميل', 'SHOP_OWNER'],
    ['getAdminInsights', 'اعرض إحصائيات البلاغات', 'ADMIN'],
    ['lookupAdminRecords', 'اعرض أحدث بلاغ', 'ADMIN'],
  ] as const
  for (const [toolName, message, role] of cases) {
    assert.ok(deterministicToolInput(toolName, message, role, emptyContext), `${toolName} did not produce deterministic input`)
  }
})

test('keeps low-stock and focused aggregate wording in server responses', () => {
  const tools = readFileSync(new URL('../src/lib/ai/tools.ts', import.meta.url), 'utf8')
  assert.match(tools, /طلباتك/)
  assert.match(tools, /قيمة الطلبات المكتملة/)

  const lowStock = presentSellerInventory({
    storeName: 'متجر الاختبار', totalParts: 0, lowStockCount: 0, parts: [], focus: 'low_stock',
  })
  const outOfStock = presentSellerInventory({
    storeName: 'متجر الاختبار', totalParts: 1, lowStockCount: 1,
    parts: [{ id: 'empty', name: 'قطعة نافدة', stock: 0, price: 100, blocked: false }], focus: 'out_of_stock',
  })
  assert.equal(lowStock.title, 'القطع منخفضة المخزون')
  assert.match(lowStock.description || '', /لا توجد قطع عند حد التنبيه/)
  assert.match(outOfStock.items?.[0]?.subtitle || '', /نفد من المخزون/)
})

test('returns the actual low-stock products for the reported production phrase', () => {
  const result = presentSellerInventory({
    storeName: 'bmw store 2', totalParts: 2, lowStockCount: 1, focus: 'low_stock',
    parts: [{ id: 'p1', name: 'سير محرك BMW', stock: 2, price: 700, blocked: false }, { id: 'p2', name: 'فلتر BMW', stock: 8, price: 350, blocked: false }],
  })
  assert.match(result.description || '', /وجدت 1 من أصل 2/)
  assert.deepEqual(result.items?.map((item) => item.title), ['سير محرك BMW'])
  assert.match(result.items?.[0]?.subtitle || '', /متبقي 2/)
  assert.equal(result.items?.[0]?.value, '٧٠٠ ج.م')
})

test('turns seller filters into database fields instead of mistaken text searches', () => {
  assert.equal(sellerListingState('اعرض القطع التي نفد مخزونها'), 'out_of_stock')
  assert.equal(sellerListingState('اعرض القطع المحظورة'), 'blocked')
  assert.equal(sellerOrderStatus('اعرض الطلبات قيد الانتظار'), 'PENDING')
  assert.equal(sellerOrderStatus('show delivered orders'), 'DELIVERED')
  assert.equal(sellerCouponState('اعرض الكوبونات الفعالة'), 'active')
  assert.equal(sellerCouponState('show expired coupons'), 'expired')
  assert.equal(sellerMessageState('اعرض رسائل العملاء غير المقروءة'), 'unread')
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'اعرض الطلبات قيد الانتظار', 'SHOP_OWNER', emptyContext), { section: 'orders', recency: 'latest', limit: 10, orderStatus: 'PENDING' })
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'اعرض الكوبونات الفعالة', 'SHOP_OWNER', emptyContext), { section: 'coupons', recency: 'latest', limit: 10, couponState: 'active' })
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'اعرض رسائل العملاء غير المقروءة', 'SHOP_OWNER', emptyContext), { section: 'messages', recency: 'latest', limit: 10, messageState: 'unread' })
  assert.deepEqual(deterministicToolInput('getSellerWorkspace', 'اعرض تقييمات نجمة واحدة', 'SHOP_OWNER', emptyContext), { section: 'reviews', recency: 'latest', limit: 10, rating: 1 })
})

test('does not mistake substrings inside ordinary Arabic words for actions', () => {
  assert.equal(planAIRequest('ابحث عن تيل فرامل متوافق مع سيارتي الأساسية', 'BUYER').forcedTool, 'findCompatibleParts')
  assert.equal(planAIRequest('اعرض أحدث بلاغ', 'ADMIN').forcedTool, 'lookupAdminRecords')
  assert.equal(planAIRequest('اعرض رسائل العملاء غير المقروءة', 'SHOP_OWNER').forcedTool, 'getSellerWorkspace')
  assert.equal(planAIRequest('اعرض تقييمات نجمة واحدة', 'SHOP_OWNER').forcedTool, 'getSellerWorkspace')
})

test('answers greetings and role help without consuming a model request', () => {
  const greeting = planDeterministicRequest({ message: 'hi', role: 'SHOP_OWNER', clientContext: emptyContext })
  const help = planDeterministicRequest({ message: 'ماذا تستطيع أن تفعل؟', role: 'ADMIN', clientContext: emptyContext })
  assert.equal(greeting?.kind, 'answer')
  assert.equal(help?.kind, 'answer')
  if (help?.kind === 'answer') assert.match(help.answer, /لا تستهلك رصيد AI/)
})

test('supports combined seller and admin record requests in one deterministic reply', () => {
  const seller = planDeterministicRequest({ message: 'اعرض آخر قطعة أو عرض تم إنشاؤه', role: 'SHOP_OWNER', forcedTool: 'getSellerWorkspace', clientContext: emptyContext })
  const admin = planDeterministicRequest({ message: 'اعرض أحدث البلاغات والنزاعات', role: 'ADMIN', forcedTool: 'lookupAdminRecords', clientContext: emptyContext })
  assert.equal(seller?.kind, 'tools')
  assert.equal(admin?.kind, 'tools')
  if (seller?.kind === 'tools') assert.deepEqual(seller.requests.map((request) => request.input.section), ['listings', 'coupons'])
  if (admin?.kind === 'tools') assert.deepEqual(admin.requests.map((request) => request.input.kind), ['report', 'dispute'])
})

test('checks deterministic commands before provider quota and concurrency', () => {
  const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('executeDeterministicAIRequest') < route.indexOf('const quotaKeys'))
  assert.ok(route.indexOf('const directResult = await executeDeterministicAIRequest') < route.indexOf('lease = await acquireAIConcurrency'))
})

test('renders normal tool results inside the reply and keeps only important cards', () => {
  const insight = { type: 'insight' as const, title: 'أداء المتجر', description: '12 طلب • 700 ج.م مبيعات' }
  const choice = { type: 'results' as const, title: 'اختر القطعة', items: [
    { id: '1', title: 'قطعة أولى', select: { kind: 'part' as const, id: '1', label: 'قطعة أولى' } },
    { id: '2', title: 'قطعة ثانية', select: { kind: 'part' as const, id: '2', label: 'قطعة ثانية' } },
  ] }
  const result = presentAIResponse('سأقوم بتحليل أداء متجرك الآن.', [insight, choice])
  assert.match(result.answer, /12 طلب/)
  assert.equal(result.answer.includes('سأقوم'), false)
  assert.deepEqual(result.cards, [choice])
})

test('always keeps confirmation proposals as interactive cards', () => {
  const proposal = { type: 'proposal' as const, title: 'تأكيد', proposal: { id: 'p1', action: 'cart_add' as const, summary: 'إضافة القطعة', expiresAt: new Date().toISOString() } }
  assert.deepEqual(presentAIResponse('', [proposal]).cards, [proposal])
})

test('keeps routine multi-record summaries in the reply instead of an extra box', () => {
  const records = { type: 'results' as const, title: 'طلبات المتجر', items: [
    { id: '1', title: 'طلب فرامل', value: '500 ج.م', select: { kind: 'order' as const, id: '1', label: 'طلب فرامل' } },
    { id: '2', title: 'طلب فلتر', value: '300 ج.م', select: { kind: 'order' as const, id: '2', label: 'طلب فلتر' } },
  ] }
  const result = presentAIResponse('', [records])
  assert.match(result.answer, /طلب فرامل/)
  assert.deepEqual(result.cards, [])
})
