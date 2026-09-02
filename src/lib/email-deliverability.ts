export const PERMANENT_RECIPIENT_STATUSES = ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'] as const

export type RecipientDeliveryStatus = 'ACTIVE' | (typeof PERMANENT_RECIPIENT_STATUSES)[number]

/** Only permanent provider outcomes block non-essential email. Delays and failed attempts remain recoverable. */
export function isPermanentRecipientStatus(value: unknown): value is (typeof PERMANENT_RECIPIENT_STATUSES)[number] {
  return typeof value === 'string' && (PERMANENT_RECIPIENT_STATUSES as readonly string[]).includes(value)
}
export function shouldSendNonessentialEmail(value: unknown) {
  return !isPermanentRecipientStatus(value)
}

export function sanitizeDeliveryReason(value: unknown, max = 300) {
  if (typeof value !== 'string') return null
  const reason = value.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, max)
  return reason || null
}

export function normalizeRecipientEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 254)
}
