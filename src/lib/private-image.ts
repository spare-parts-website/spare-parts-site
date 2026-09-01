const PRIVATE_IMAGE_URL = /^\/api\/private-image\?path=([A-Za-z0-9._%~-]{20,220})$/
const PRIVATE_PATH = /^[A-Za-z0-9._-]{20,220}$/

/**
 * Private uploads are associated with their resource when the message,
 * dispute, or verification request is written. The generated path is only
 * used as an upload-ownership check here; reads still require a database
 * resource and participant authorization in the private-image route.
 */
export function privateImagePath(value: unknown) {
  if (typeof value !== 'string') return null
  const match = PRIVATE_IMAGE_URL.exec(value)
  if (!match) return null
  try {
    const path = decodeURIComponent(match[1])
    return PRIVATE_PATH.test(path) ? path : null
  } catch {
    return null
  }
}

export function isPrivateImageOwnedBy(value: unknown, purpose: 'chat' | 'evidence' | 'verification', userId: string) {
  const path = privateImagePath(value)
  return Boolean(path && path.startsWith(`${purpose}-${userId}-`))
}
