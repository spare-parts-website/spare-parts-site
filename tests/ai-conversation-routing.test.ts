import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeterministicRequest } from '../src/lib/ai/deterministic-routing.ts'
import type { AIRole, AIToolName } from '../src/lib/ai/types.ts'

const emptyContext = { cart: [] }

function plan(message: string, role: AIRole = 'GUEST', forcedTool?: AIToolName) {
  return planDeterministicRequest({ message, role, forcedTool, clientContext: emptyContext })
}

test('does not mistake task-specific help for the generic capability response', () => {
  const result = plan('can you help me find brake pads for a BMW?', 'GUEST', 'searchMarketplace')
  assert.equal(result?.kind, 'tool')
  if (result?.kind === 'tool') assert.equal(result.toolName, 'searchMarketplace')

  const helpful = plan('this is helpful, find brake pads for BMW', 'GUEST', 'searchMarketplace')
  assert.equal(helpful?.kind, 'tool')
  if (helpful?.kind === 'tool') assert.equal(helpful.toolName, 'searchMarketplace')
})

test('routes account creation questions to registration instead of a capability dump', () => {
  const result = plan('hello can help me make an account ?')
  assert.equal(result?.kind, 'answer')
  if (result?.kind !== 'answer') return
  assert.match(result.answer, /\/register/)
  assert.match(result.answer, /buyer|shop-owner/i)
  assert.doesNotMatch(result.answer, /Instant, no-AI-credit|no-AI-credit commands/i)
})

test('supports Arabic account creation and password recovery questions directly', () => {
  const account = plan('ممكن تساعدني اعمل حساب جديد؟')
  assert.equal(account?.kind, 'answer')
  if (account?.kind === 'answer') assert.match(account.answer, /\/register/)

  const password = plan('I forgot my password, can you help?')
  assert.equal(password?.kind, 'answer')
  if (password?.kind === 'answer') assert.match(password.answer, /\/forgot-password/)
})

test('keeps genuine meta-help concise and role-accurate', () => {
  const guestHelp = plan('what can you do?')
  assert.equal(guestHelp?.kind, 'answer')
  if (guestHelp?.kind !== 'answer') return
  assert.doesNotMatch(guestHelp.answer, /no-AI-credit|recent orders|favorite stores|your cart/i)
  assert.match(guestHelp.answer, /public marketplace|registration|sign-in/i)

  const buyerHelp = plan('help me', 'BUYER')
  assert.equal(buyerHelp?.kind, 'answer')
  if (buyerHelp?.kind === 'answer') assert.match(buyerHelp.answer, /orders|cart|favorite stores/i)
})

test('does not tell a guest greeting that private account data is available', () => {
  const result = plan('hello')
  assert.equal(result?.kind, 'answer')
  if (result?.kind !== 'answer') return
  assert.doesNotMatch(result.answer, /your account|your orders|your cart|favorite stores/i)
  assert.match(result.answer, /public parts and stores/i)
})

test('keeps help-prefixed navigation requests deterministic', () => {
  const result = plan('please help me open the cart', 'BUYER', 'navigate')
  assert.equal(result?.kind, 'tool')
  if (result?.kind === 'tool') {
    assert.equal(result.toolName, 'navigate')
    assert.deepEqual(result.input, { destination: 'cart' })
  }
})
