import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DEFAULT_AI_QUOTAS, maskEmail, maskPhone, roleCanPrepareAction } from '../src/lib/ai/policy.ts'

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
