const BLOCKED_STORE_NAMES = new Set(['nigga'])

export function isBlockedStoreName(name: string | null | undefined) {
  if (!name) return false
  return BLOCKED_STORE_NAMES.has(name.trim().toLocaleLowerCase())
}
