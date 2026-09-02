export const VERIFIED_EMAIL_DOMAIN = 'ghyarmarket-eg.com'

export function isValidEmailAddress(value: unknown) {
  return typeof value === 'string' && value.length <= 254 && /^\S+@\S+\.\S+$/.test(value.trim())
}
/** Return only role addresses on the verified production domain. */
export function getTransactionalSender(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (isValidEmailAddress(candidate) && candidate.endsWith(`@${VERIFIED_EMAIL_DOMAIN}`)) return candidate
  }
  return null
}
