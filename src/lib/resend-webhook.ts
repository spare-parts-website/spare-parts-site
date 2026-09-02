export type DeliveryStatus = 'SENT' | 'DELAYED' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'COMPLAINED' | 'SUPPRESSED'

export type ParsedDeliveryEvent = {
  eventType: string
  providerId: string
  status: DeliveryStatus
  error: string | null
  occurredAt: Date | null
}
const EVENT_STATUS: Record<string, DeliveryStatus> = {
  'email.sent': 'SENT',
  'email.scheduled': 'SENT',
  'email.delivery_delayed': 'DELAYED',
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.failed': 'FAILED',
  'email.complained': 'COMPLAINED',
  'email.suppressed': 'SUPPRESSED',
}

function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, max) : ''
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

export function parseResendDeliveryEvent(value: unknown): ParsedDeliveryEvent | null {
  const event = object(value)
  const data = object(event?.data)
  const eventType = text(event?.type, 60)
  const providerId = text(data?.email_id, 160)
  const status = EVENT_STATUS[eventType]
  if (!status || !providerId) return null

  const detail = eventType === 'email.bounced'
    ? object(data?.bounce)
    : eventType === 'email.failed'
      ? object(data?.failed)
      : eventType === 'email.suppressed'
        ? object(data?.suppressed)
        : null
  const error = detail
    ? text([text(detail.type, 60), text(detail.subType, 60), text(detail.reason, 120), text(detail.message, 120)].filter(Boolean).join(': '), 300) || null
    : status === 'COMPLAINED' ? 'recipient_complaint' : status === 'DELAYED' ? 'delivery_delayed' : null
  const rawDate = text(event?.created_at, 80)
  const parsedDate = rawDate ? new Date(rawDate) : null
  return { eventType, providerId, status, error, occurredAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null }
}

const STATUS_RANK: Record<DeliveryStatus, number> = {
  SENT: 0,
  DELAYED: 1,
  FAILED: 2,
  DELIVERED: 3,
  BOUNCED: 4,
  COMPLAINED: 4,
  SUPPRESSED: 4,
}

/** Prevent delayed/out-of-order provider events from regressing a stronger lifecycle outcome. */
export function shouldApplyDeliveryStatus(current: DeliveryStatus | string, incoming: DeliveryStatus) {
  const currentRank = STATUS_RANK[current as DeliveryStatus]
  return currentRank === undefined || STATUS_RANK[incoming] >= currentRank
}
