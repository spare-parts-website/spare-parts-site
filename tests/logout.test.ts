import assert from 'node:assert/strict'
import test from 'node:test'
import { revokeCurrentSession } from '../src/lib/logout.ts'

test('logout accepts confirmed server revocation', async () => {
  await revokeCurrentSession(async () => new Response(null, { status: 204 }))
})
test('logout rejects server failure instead of pretending the session ended', async () => {
  await assert.rejects(revokeCurrentSession(async () => new Response(null, { status: 503 })))
})
test('logout propagates connection failure', async () => {
  await assert.rejects(revokeCurrentSession(async () => { throw new TypeError('offline') }))
})
