import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseResendDeliveryEvent, shouldApplyDeliveryStatus } from '@/lib/resend-webhook'
import { isPermanentRecipientStatus, normalizeRecipientEmail, sanitizeDeliveryReason } from '@/lib/email-deliverability'
import { notifyOperationalAlert } from '@/lib/operational-alerts'

const MAX_BODY_BYTES = 256 * 1024

export const runtime = 'nodejs'

function header(req: NextRequest, ...names: string[]) {
  for (const name of names) {
    const value = req.headers.get(name)
    if (value) return value
  }
  return ''
}
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook غير مهيأ' }, { status: 503 })
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'حمولة كبيرة' }, { status: 413 })

  const payload = await req.text()
  if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'حمولة كبيرة' }, { status: 413 })
  const webhookId = header(req, 'svix-id', 'webhook-id')
  const timestamp = header(req, 'svix-timestamp', 'webhook-timestamp')
  const signature = header(req, 'svix-signature', 'webhook-signature')
  if (!webhookId || !timestamp || !signature) return NextResponse.json({ error: 'توقيع غير صالح' }, { status: 400 })

  let verified: unknown
  try {
    // Resend uses the Standard Webhooks/Svix signature scheme. Verification
    // happens before JSON parsing or any database lookup.
    const resend = new Resend('webhook-verification-only')
    verified = resend.webhooks.verify({ webhookSecret: secret, payload, headers: { id: webhookId, timestamp, signature } })
  } catch {
    return NextResponse.json({ error: 'توقيع غير صالح' }, { status: 400 })
  }

  const event = parseResendDeliveryEvent(verified)
  if (!event) return NextResponse.json({ ok: true, ignored: true })
  const outcome = await db.$transaction(async (tx) => {
    const attempt = await tx.emailDeliveryAttempt.findFirst({
      where: { providerId: event.providerId },
      include: { notification: { select: { userId: true } } },
    })
    // A provider event can arrive before the send response is persisted. Do not
    // manufacture an attempt without a known provider record.
    if (!attempt) return { kind: 'unmatched' as const, attemptId: '' }
    if (attempt.lastEventId === webhookId) return { kind: 'duplicate' as const, attemptId: attempt.id }
    if (attempt.lastEventAt && event.occurredAt && event.occurredAt < attempt.lastEventAt) return { kind: 'stale' as const, attemptId: attempt.id }
    if (!shouldApplyDeliveryStatus(attempt.status, event.status)) return { kind: 'stale' as const, attemptId: attempt.id }

    // Guard the write with both event id and event time. The row lock makes a
    // concurrent retry or out-of-order event observe the committed winner.
    const applied = await tx.emailDeliveryAttempt.updateMany({
      where: {
        id: attempt.id,
        AND: [
          { OR: [{ lastEventId: null }, { lastEventId: { not: webhookId } }] },
          ...(event.occurredAt ? [{ OR: [{ lastEventAt: null }, { lastEventAt: { lte: event.occurredAt } }] }] : []),
        ],
      },
      data: { status: event.status, error: event.error, lastEventId: webhookId, lastEventAt: event.occurredAt },
    })
    if (applied.count !== 1) return { kind: 'duplicate' as const, attemptId: attempt.id }

    const recipientUserId = attempt.recipientUserId || attempt.notification?.userId
    if (isPermanentRecipientStatus(event.status) && recipientUserId && attempt.recipientEmail) {
      const recipient = await tx.user.findUnique({ where: { id: recipientUserId }, select: { id: true, email: true } })
      // A late event for an address the user has already replaced must not
      // suppress their new address.
      if (recipient && normalizeRecipientEmail(recipient.email) === normalizeRecipientEmail(attempt.recipientEmail)) {
        await tx.user.update({
          where: { id: recipient.id },
          data: {
            emailDeliveryStatus: event.status,
            emailDeliveryReason: sanitizeDeliveryReason(event.error),
            emailDeliveryAt: event.occurredAt || new Date(),
          },
        })
      }
    }
    return { kind: 'matched' as const, attemptId: attempt.id }
  })
  if (outcome.kind === 'unmatched') return NextResponse.json({ ok: true, matched: false }, { status: 202 })
  if (outcome.kind === 'duplicate') return NextResponse.json({ ok: true, duplicate: true })
  if (outcome.kind === 'stale') return NextResponse.json({ ok: true, stale: true })
  if (['BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'].includes(event.status)) {
    await audit({ actorId: null, action: `EMAIL_${event.status}`, targetType: 'email_delivery', targetId: outcome.attemptId, metadata: { eventType: event.eventType } })
    void notifyOperationalAlert('email.delivery.permanent_failure', { status: event.status, eventType: event.eventType })
  }
  return NextResponse.json({ ok: true, matched: true })
}
