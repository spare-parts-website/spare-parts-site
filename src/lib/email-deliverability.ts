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

const COMMON_DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
}

export type RecipientEmailValidation =
  | { valid: true; email: string; suggestion: null }
  | { valid: false; email: string; suggestion: string | null }

/** Validate user-entered recipient addresses and flag common provider-domain typos before sending. */
export function validateRecipientEmail(value: unknown): RecipientEmailValidation {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    return { valid: false, email, suggestion: null }
  }
  const separator = email.lastIndexOf('@')
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const correctedDomain = COMMON_DOMAIN_TYPOS[domain]
  return correctedDomain
    ? { valid: false, email, suggestion: `${local}@${correctedDomain}` }
    : { valid: true, email, suggestion: null }
}

export function recipientEmailError(result: RecipientEmailValidation) {
  return result.suggestion
    ? `يبدو أن نطاق البريد غير صحيح. هل تقصد ${result.suggestion}؟`
    : 'البريد الإلكتروني غير صالح'
}
