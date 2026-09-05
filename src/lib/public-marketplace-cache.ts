import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPublicPartsList, getPublicStoresList } from '@/lib/public-marketplace'

// The root layout is intentionally dynamic for the per-request CSP nonce, so
// page-level revalidate alone cannot reuse these database results. Cache only
// the anonymous default landing payloads for the same 30-second freshness
// window already advertised by the public marketplace routes.
export const getCachedPublicPartsLanding = unstable_cache(
  () => getPublicPartsList({ sort: 'newest', page: 1 }),
  ['public-parts-landing-v1'],
  { revalidate: 30 },
)

export const getCachedPublicStoresLanding = unstable_cache(
  () => getPublicStoresList('', 1),
  ['public-stores-landing-v1'],
  { revalidate: 30 },
)
