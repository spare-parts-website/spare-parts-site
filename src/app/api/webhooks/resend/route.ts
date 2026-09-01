import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseResendDeliveryEvent, shouldApplyDeliveryStatus } from '@/lib/resend-webhook'

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
  const attempt = await db.emailDeliveryAttempt.findFirst({ where: { providerId: event.providerId } })
  // A provider event can arrive before the send response is persisted. Do not
  // manufacture an attempt without its required notification relation.
  if (!attempt) return NextResponse.json({ ok: true, matched: false }, { status: 202 })
  if (attempt.lastEventId === webhookId) return NextResponse.json({ ok: true, duplicate: true })
  if (attempt.lastEventAt && event.occurredAt && event.occurredAt < attempt.lastEventAt) return NextResponse.json({ ok: true, stale: true })
  if (!shouldApplyDeliveryStatus(attempt.status, event.status)) return NextResponse.json({ ok: true, stale: true })

  await db.emailDeliveryAttempt.update({
    where: { id: attempt.id },
    data: { status: event.status, error: event.error, lastEventId: webhookId, lastEventAt: event.occurredAt },
  })
  if (['BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'].includes(event.status)) {
    await audit({ actorId: null, action: `EMAIL_${event.status}`, targetType: 'email_delivery', targetId: attempt.id, metadata: { eventType: event.eventType } })
  }
  return NextResponse.json({ ok: true, matched: true })
}
