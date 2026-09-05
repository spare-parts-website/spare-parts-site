export const STORE_MODERATION_STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'BLOCKED'] as const
export type StoreModerationStatus = (typeof STORE_MODERATION_STATUSES)[number]
export const PUBLIC_STORE_MODERATION_STATUS: StoreModerationStatus = 'ACTIVE'

export function isStoreModerationStatus(value: unknown): value is StoreModerationStatus {
  return typeof value === 'string' && STORE_MODERATION_STATUSES.includes(value as StoreModerationStatus)
}

export function isStorePublic(status: string | null | undefined) {
  return status === PUBLIC_STORE_MODERATION_STATUS
}
