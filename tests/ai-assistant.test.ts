import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DEFAULT_AI_QUOTAS, maskEmail, maskPhone, roleCanPrepareAction } from '../src/lib/ai/policy.ts'
import { cleanWebSearchQuery, planAIRequest } from '../src/lib/ai/planner.ts'
import { presentAIResponse } from '../src/lib/ai/presentation.ts'

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
})

test('uses stable Gemini Flash Lite with zero-cost provider failover', () => {
  const runtime = readFileSync(new URL('../src/lib/ai/runtime.ts', import.meta.url), 'utf8')
  const agent = readFileSync(new URL('../src/lib/ai/agent.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  const assistant = readFileSync(new URL('../src/components/ai-assistant.tsx', import.meta.url), 'utf8')
  const imagePolicy = readFileSync(new URL('../src/lib/image-policy.ts', import.meta.url), 'utf8')
  assert.match(runtime, /gemini-2\.5-flash-lite/)
  assert.match(runtime, /'gateway'[\s\S]*'google'[\s\S]*'openrouter'/)
  assert.match(agent, /openrouter\/free/)
  assert.match(agent, /alibaba\/qwen3-vl-instruct/)
  assert.match(route, /EMPTY_AI_RESPONSE/)
  assert.match(route, /part\.type === 'text' && Boolean\(part\.text\.trim\(\)\)/)
  assert.match(route, /terminalFallback/)
  assert.match(assistant, /requestAgeSeconds < 50/)
  assert.match(assistant, /PromptInputAttachmentsButton/)
  assert.match(assistant, /isAbort.*isDisconnect.*isError/)
  assert.match(assistant, /current\.filter\(\(item\) => item\.id !== message\.id\)/)
  for (const removed of ['stealth/ox-alpha', 'google/gemma-4-31b-it:free', 'OPENROUTER_FAST_MODEL', 'OPENROUTER_DEEP_MODEL', 'AI_MODE_KEY']) {
    assert.equal(`${runtime}\n${assistant}\n${imagePolicy}`.includes(removed), false)
  }
})

test('executes safe obvious tools directly without a model', () => {
  const tools = readFileSync(new URL('../src/lib/ai/tools.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/ai/route.ts', import.meta.url), 'utf8')
  for (const name of ['getAccountContext', 'getSellerInsights', 'getAdminInsights', 'searchMarketplace', 'findCompatibleParts', 'getSellerWorkspace']) assert.match(tools, new RegExp(name))
  assert.match(route, /executeDirectAITool/)
  assert.match(route, /ai\.direct_tool\.completed/)
  assert.match(tools, /buildSellerPerformancePlan/)
  assert.match(route, /ai\.seller_plan\.completed/)
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
