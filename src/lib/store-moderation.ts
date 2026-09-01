export const BLOCKED_STORE_NAMES = ['nigga'] as const

const BLOCKED_STORE_NAME_SET = new Set<string>(BLOCKED_STORE_NAMES)

export function isBlockedStoreName(name: string | null | undefined) {
  if (!name) return false
  return BLOCKED_STORE_NAME_SET.has(name.trim().toLocaleLowerCase())
}
