import 'server-only'

const FALLBACK_SUPABASE_URL = 'https://sufrsfrrrzhhdluolxdf.supabase.co'
const EXPECTED_SUPABASE_ORIGIN = 'https://sufrsfrrrzhhdluolxdf.supabase.co'
const SAFE_OBJECT_NAME = /^[A-Za-z0-9._-]+$/

export function supabaseOrigin() {
  const raw = (process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL).trim()
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.origin !== EXPECTED_SUPABASE_ORIGIN) throw new Error('invalid')
    return url.origin
  } catch {
    if (process.env.NODE_ENV === 'production') throw new Error('SUPABASE_URL must match the configured Ghyar Market Supabase HTTPS origin')
    return FALLBACK_SUPABASE_URL
  }
}

export function supabaseHostname() {
  return new URL(supabaseOrigin()).hostname
}

export function isPublicUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 700) return false
  try {
    const url = new URL(value)
    if (url.origin !== supabaseOrigin() || url.username || url.password || url.search || url.hash) return false
    const prefix = '/storage/v1/object/public/uploads/'
    if (!url.pathname.startsWith(prefix)) return false
    const objectName = decodeURIComponent(url.pathname.slice(prefix.length))
    return SAFE_OBJECT_NAME.test(objectName) && !objectName.includes('/')
  } catch {
    return false
  }
}
