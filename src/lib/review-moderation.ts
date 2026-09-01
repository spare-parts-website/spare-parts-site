/**
 * Keep development fixtures in the database for audit/history, but never let
 * the explicitly-known fixture accounts affect public trust signals.
 *
 * This is deliberately narrow: unverified customer reviews are not hidden by
 * this helper, and legitimate names containing similar words are preserved.
 */
export function normalizeReviewAuthorName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[‐‑‒–—―-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

const KNOWN_DEVELOPMENT_REVIEW_AUTHORS = new Set([
  'site admin',
  'amr مطور موقع غيار ماركت',
])

export function isDevelopmentReviewAuthor(value: string | null | undefined) {
  if (!value) return false
  return KNOWN_DEVELOPMENT_REVIEW_AUTHORS.has(normalizeReviewAuthorName(value))
}
