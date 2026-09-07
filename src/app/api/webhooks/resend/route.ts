import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { parseResendDeliveryEvent } from '@/lib/resend-webhook'
import { persistAndReconcileWebhookEvent } from '@/lib/email-webhook-events'
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
    const resend = new Resend('webhook-verification-only')
    verified = resend.webhooks.verify({ webhookSecret: secret, payload, headers: { id: webhookId, timestamp, signature } })
  } catch {
    return NextResponse.json({ error: 'توقيع غير صالح' }, { status: 400 })
  }

  const event = parseResendDeliveryEvent(verified)
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  // Persist first. A webhook that beats the Resend send-response is now kept
  // until the outbox worker attaches providerId and replays it.
  const outcome = await persistAndReconcileWebhookEvent(webhookId, event)
  if (outcome.duplicate) return NextResponse.json({ ok: true, duplicate: true })
  if (!outcome.matched) return NextResponse.json({ ok: true, matched: false, queued: true }, { status: 202 })

  if (outcome.applied.includes(event.status) && ['BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED'].includes(event.status)) {
    void notifyOperationalAlert('email.delivery.permanent_failure', { status: event.status, eventType: event.eventType })
  }
  return NextResponse.json({ ok: true, matched: true })
}
