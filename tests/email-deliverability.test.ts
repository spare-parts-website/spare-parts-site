import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { isPermanentRecipientStatus, recipientEmailError, shouldSendNonessentialEmail, sanitizeDeliveryReason, validateRecipientEmail } from '../src/lib/email-deliverability.ts'
import { getTransactionalSender } from '../src/lib/email-sender.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('only permanent bounce, complaint, and provider suppression block nonessential email', () => {
  assert.equal(isPermanentRecipientStatus('BOUNCED'), true)
  assert.equal(isPermanentRecipientStatus('COMPLAINED'), true)
  assert.equal(isPermanentRecipientStatus('SUPPRESSED'), true)
  assert.equal(isPermanentRecipientStatus('DELAYED'), false)
  assert.equal(isPermanentRecipientStatus('FAILED'), false)
  assert.equal(shouldSendNonessentialEmail('DELAYED'), true)
  assert.equal(shouldSendNonessentialEmail('FAILED'), true)
  assert.equal(shouldSendNonessentialEmail('BOUNCED'), false)
})

test('delivery reasons are bounded and never retain line breaks', () => {
  assert.equal(sanitizeDeliveryReason(' permanent\nprovider detail\tmore '), 'permanent provider detail more')
  assert.equal(sanitizeDeliveryReason(''), null)
  assert.equal(sanitizeDeliveryReason('x'.repeat(500))?.length, 300)
})

test('recipient validation rejects malformed and common typo domains with a safe suggestion', () => {
  assert.deepEqual(validateRecipientEmail(' Buyer@GAMIL.com '), {
    valid: false,
    email: 'buyer@gamil.com',
    suggestion: 'buyer@gmail.com',
  })
  assert.match(recipientEmailError(validateRecipientEmail('buyer@gamil.com')), /buyer@gmail\.com/)
  assert.equal(validateRecipientEmail('buyer@gmail.com').valid, true)
  assert.equal(validateRecipientEmail('buyer@@gmail.com').valid, false)
})

test('transactional senders are restricted to the verified Ghyar Market domain', () => {
  assert.equal(getTransactionalSender('alerts@ghyarmarket-eg.com'), 'alerts@ghyarmarket-eg.com')
  assert.equal(getTransactionalSender('alerts@other.example', 'security@ghyarmarket-eg.com'), 'security@ghyarmarket-eg.com')
  assert.equal(getTransactionalSender('alerts@other.example'), null)
})

test('notification delivery uses recipient state and stable dedupe keys', () => {
  const notifications = read('src/lib/notifications.ts')
  const webhook = read('src/app/api/webhooks/resend/route.ts')
  const migration = read('prisma/email-deliverability.sql')
  const recordsMigration = read('prisma/email-delivery-records.sql')
  const metrics = read('src/app/api/admin/email-deliverability/route.ts')
  const login = read('src/lib/login-verification.ts')
  const reset = read('src/lib/password-reset.ts')
  const support = read('src/lib/support-email.ts')
  const delivery = read('src/lib/email-delivery.ts')
  const account = read('src/app/api/account/route.ts')
  const adminUsers = read('src/app/api/admin/users/route.ts')
  assert.match(notifications, /emailDeliveryStatus/)
  assert.match(notifications, /shouldSendNonessentialEmail/)
  assert.match(notifications, /dedupeKey/)
  assert.match(notifications, /recipientEmail/)
  assert.match(webhook, /isPermanentRecipientStatus/)
  assert.match(webhook, /normalizeRecipientEmail\(recipient\.email\)/)
  assert.match(webhook, /updateMany\(/)
  assert.match(delivery, /shouldApplyDeliveryStatus/)
  assert.match(delivery, /pg_advisory_xact_lock/)
  assert.match(login, /isPermanentRecipientStatus/)
  assert.match(reset, /isPermanentRecipientStatus/)
  assert.match(support, /SUPPORT_EMAIL_INVALID/)
  assert.match(migration, /emailDeliveryStatus/)
  assert.match(migration, /Notification_dedupeKey_key/)
  assert.match(migration, /recipientEmail/)
  assert.match(recordsMigration, /deliveryKey/)
  assert.match(recordsMigration, /notificationId.*drop not null/)
  assert.match(metrics, /requireRole\('ADMIN'\)/)
  assert.match(metrics, /deliveryRate/)
  assert.match(metrics, /suppressedRecipients/)
  for (const senderSource of [login, reset, support]) assert.match(senderSource, /getTransactionalSender/)
  assert.match(account, /أدخل كلمة المرور الحالية لتغيير البريد الإلكتروني/)
  assert.match(account, /emailDeliveryStatus: 'ACTIVE'/)
  assert.match(adminUsers, /emailDeliveryStatus/)
  assert.match(adminUsers, /validateRecipientEmail/)
})
