import 'server-only'

import { db } from '@/lib/db'

export const STORE_MODERATION_STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'BLOCKED'] as const
export type StoreModerationStatus = (typeof STORE_MODERATION_STATUSES)[number]
export const PUBLIC_STORE_MODERATION_STATUS: StoreModerationStatus = 'ACTIVE'

export function isStoreModerationStatus(value: unknown): value is StoreModerationStatus {
  return typeof value === 'string' && STORE_MODERATION_STATUSES.includes(value as StoreModerationStatus)
}

export function isStorePublic(status: string | null | undefined) {
  return status === PUBLIC_STORE_MODERATION_STATUS
}

// Temporary compatibility for the AI compatibility-search tool while that
// large module is split in a later architecture phase. The decision is backed
// by the Store moderation status, never by a hard-coded name list. Unknown or
// not-yet-cached stores fail closed so blocked stores are never surfaced.
const ACTIVE_STORE_CACHE_TTL_MS = 60 * 1000
let activeStoreNames = new Set<string>()
let activeStoreCacheExpiresAt = 0
let activeStoreRefresh: Promise<void> | null = null

function normalizedStoreName(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

function refreshActiveStores() {
  if (activeStoreRefresh) return activeStoreRefresh
  activeStoreRefresh = db.store.findMany({
    where: { moderationStatus: PUBLIC_STORE_MODERATION_STATUS },
    select: { name: true },
  }).then((stores) => {
    activeStoreNames = new Set(stores.map((store) => normalizedStoreName(store.name)))
    activeStoreCacheExpiresAt = Date.now() + ACTIVE_STORE_CACHE_TTL_MS
  }).catch((error) => {
    console.error('Store moderation cache refresh failed', error instanceof Error ? error.message : 'unknown')
    activeStoreCacheExpiresAt = Date.now() + 5_000
  }).finally(() => {
    activeStoreRefresh = null
  })
  return activeStoreRefresh
}

void refreshActiveStores()

export function isBlockedStoreName(name: string) {
  if (Date.now() >= activeStoreCacheExpiresAt) void refreshActiveStores()
  return !activeStoreNames.has(normalizedStoreName(name))
}
