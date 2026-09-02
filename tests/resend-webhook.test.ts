import assert from 'node:assert/strict'
import test from 'node:test'
import { parseResendDeliveryEvent, shouldApplyDeliveryStatus } from '../src/lib/resend-webhook.ts'
import { readFileSync } from 'node:fs'

test('parses delivery lifecycle events without retaining private payloads', () => {
  const bounced = parseResendDeliveryEvent({
    type: 'email.bounced',
    created_at: '2026-09-01T10:00:00.000Z',
    data: { email_id: 'provider-123', bounce: { type: 'permanent', subType: 'no_mailbox', message: 'mailbox missing\nprivate detail' } },
  })
  assert.equal(bounced?.status, 'BOUNCED')
  assert.equal(bounced?.providerId, 'provider-123')
  assert.equal(bounced?.error, 'permanent: no_mailbox: mailbox missing private detail')
  assert.equal(bounced?.occurredAt?.toISOString(), '2026-09-01T10:00:00.000Z')
  assert.equal(parseResendDeliveryEvent({ type: 'contact.created', data: { id: 'not-an-email' } }), null)
})
test('delivery status handling is idempotent and does not regress terminal events', () => {
  assert.equal(shouldApplyDeliveryStatus('SENT', 'DELIVERED'), true)
  assert.equal(shouldApplyDeliveryStatus('DELAYED', 'DELIVERED'), true)
  assert.equal(shouldApplyDeliveryStatus('DELIVERED', 'DELAYED'), false)
  assert.equal(shouldApplyDeliveryStatus('BOUNCED', 'FAILED'), true)
})

test('Resend webhook verifies Standard Webhooks signatures before database access', () => {
  const route = readFileSync(new URL('../src/app/api/webhooks/resend/route.ts', import.meta.url), 'utf8')
  assert.match(route, /RESEND_WEBHOOK_SECRET/)
  assert.match(route, /resend\.webhooks\.verify/)
  assert.match(route, /svix-signature/)
  assert.match(route, /emailDeliveryAttempt\.findFirst/)
  assert.match(route, /recipientUserId/)
  assert.match(route, /lastEventId/)
  assert.doesNotMatch(route, /console\.log\(payload/)
})
