const PRODUCTION_ORIGIN = 'https://ghyarmarket-eg.com'

function validOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export function applicationOrigin() {
  const configured = validOrigin(process.env.APP_URL) || validOrigin(process.env.NEXTAUTH_URL)
  if (configured) return configured

  const vercelOrigin = validOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  if (vercelOrigin) return vercelOrigin

  return process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000'
}
