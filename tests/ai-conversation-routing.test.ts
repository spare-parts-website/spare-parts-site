import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeterministicRequest } from '../src/lib/ai/deterministic-routing.ts'
import { planAIRequest } from '../src/lib/ai/planner-model-first.ts'
import type { AIClientContext } from '../src/lib/ai/types.ts'

const emptyContext: AIClientContext = { cart: [] }

for (const message of [
  'hello',
  'help',
  'hello can help me make an account ?',
  'عايز أعمل حساب',
  'نسيت كلمة المرور',
  'please help me open my cart',
  'find BMW brake pads',
  'اعرض طلباتي',
]) {
  test(`never returns an instant deterministic answer for: ${message}`, () => {
    assert.equal(planDeterministicRequest({ message, role: 'GUEST', clientContext: emptyContext }), undefined)
  })
}

for (const message of [
  'how do I register?',
  'I need an account',
  'help me create a seller account',
  'register as a seller',
  'عايز أعمل حساب',
  'عاوز اعمل حساب',
  'ازاي اسجل في الموقع',
  'ازاي اعمل اكونت',
  'عايز أعمل حساب بائع',
  'ازاي ابقى بائع',
]) {
  test(`signup language stays conversational instead of becoming marketplace search: ${message}`, () => {
    const plan = planAIRequest(message, 'GUEST')
    assert.notEqual(plan.intent, 'marketplace_search')
    assert.equal(plan.forcedTool, undefined)
    assert.deepEqual(plan.tools, [])
    assert.equal(plan.plannerMode, 'structured-agent')
  })
}

for (const message of ['what is this', 'ايه ده', 'what car might this part belong to?', 'القطعة دي ممكن تكون لعربية ايه؟']) {
  test(`image-style question remains model-routed and is not searched literally: ${message}`, () => {
    const plan = planAIRequest(message, 'GUEST')
    assert.notEqual(plan.intent, 'marketplace_search')
    assert.equal(planDeterministicRequest({ message, role: 'GUEST', clientContext: emptyContext }), undefined)
    assert.equal(plan.forcedTool, undefined)
  })
}

test('model-first planner never forces or restricts tools for guest conversation', () => {
  const plan = planAIRequest('عايز أعمل حساب', 'GUEST')
  assert.equal(plan.forcedTool, undefined)
  assert.deepEqual(plan.tools, [])
  assert.equal(plan.plannerMode, 'structured-agent')
  assert.ok(plan.maxSteps >= 3)
})

test('model-first planner does not force a guessed protected action from broad Arabic verbs', () => {
  const plan = planAIRequest('عايز أعمل حساب', 'GUEST')
  assert.equal(plan.forcedTool, undefined)
  assert.deepEqual(plan.tools, [])
})

test('seller insight requests cannot take the route-level instant seller shortcut', () => {
  const plan = planAIRequest('حلل أداء متجري واقترح سعر مناسب', 'SHOP_OWNER')
  assert.equal(plan.intent, 'conversation')
  assert.equal(plan.forcedTool, undefined)
  assert.deepEqual(plan.tools, [])
})

test('seller message workflows also stay model-routed', () => {
  const plan = planAIRequest('رد على رسالة العميل', 'SHOP_OWNER')
  assert.equal(plan.intent, 'conversation')
  assert.equal(plan.forcedTool, undefined)
  assert.deepEqual(plan.tools, [])
})
