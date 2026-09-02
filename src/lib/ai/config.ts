/** Server-side AI provider configuration helpers with no database imports. */
export function aiPaidPrimaryModel() {
  const model = process.env.OPENROUTER_PRIMARY_MODEL?.trim() || ''
  return /^[A-Za-z0-9._/:~-]{3,160}$/.test(model) && !/:free$/i.test(model) ? model : null
}
