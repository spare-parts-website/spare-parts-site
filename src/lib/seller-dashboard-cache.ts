export type SellerCoreTab = 'parts' | 'orders' | 'store'

type SellerCacheEntry = {
  fetchedAt: number
  data: Record<string, unknown>
}

const SELLER_CACHE_TTL = 30_000
const sellerCache = new Map<string, SellerCacheEntry>()
const sellerInFlight = new Map<string, Promise<Record<string, unknown>>>()

function key(userId: string, tab: SellerCoreTab) {
  return `${userId}:${tab}`
}

function endpoint(tab: SellerCoreTab) {
  return tab === 'parts' ? '/api/parts?scope=mine' : tab === 'orders' ? '/api/orders?scope=shop' : '/api/shop/store'
}

export function readSellerCore(userId: string, tab: SellerCoreTab) {
  return sellerCache.get(key(userId, tab))
}

export async function loadSellerCore(userId: string, tab: SellerCoreTab, force = false) {
  const cacheKey = key(userId, tab)
  const cached = sellerCache.get(cacheKey)
  if (!force && cached && Date.now() - cached.fetchedAt < SELLER_CACHE_TTL) return cached.data
  const pending = sellerInFlight.get(cacheKey)
  if (!force && pending) return pending

  const request = fetch(endpoint(tab), { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'SHOP_TAB_LOAD_FAILED')
      sellerCache.set(cacheKey, { fetchedAt: Date.now(), data })
      return data as Record<string, unknown>
    })
    .finally(() => sellerInFlight.delete(cacheKey))

  sellerInFlight.set(cacheKey, request)
  return request
}

export async function warmSellerCore(userId: string, currentTab?: string) {
  const tabs: SellerCoreTab[] = ['parts', 'orders', 'store']
  await Promise.allSettled(tabs.filter((tab) => tab !== currentTab).map((tab) => loadSellerCore(userId, tab)))
}

export function updateSellerCore(userId: string, tab: SellerCoreTab, data: Record<string, unknown>) {
  sellerCache.set(key(userId, tab), { fetchedAt: Date.now(), data })
}
