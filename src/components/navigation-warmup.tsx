'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'

// Refresh before the five-minute client router stale window expires. This is
// intentionally infrequent: it keeps the four high-frequency route payloads
// hot without creating a polling-style navigation tax.
const WARM_REFRESH_MS = 4 * 60 * 1000

export function NavigationWarmup() {
  const router = useRouter()
  const role = useAppStore((state) => state.user?.role)

  useEffect(() => {
    const routes = new Set(['/', '/parts', '/stores', '/support'])

    if (role === 'BUYER' || role === 'SHOP_OWNER') {
      routes.add('/account/orders')
      routes.add('/account/profile')
      routes.add('/account/wishlist')
    }
    if (role === 'SHOP_OWNER') {
      routes.add('/seller/parts')
      routes.add('/seller/orders')
      routes.add('/seller/store')
    }
    if (role === 'ADMIN') {
      routes.add('/admin/users')
      routes.add('/admin/parts')
      routes.add('/admin/support')
    }

    const warm = () => routes.forEach((href) => router.prefetch(href))
    warm()
    const interval = window.setInterval(warm, WARM_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [role, router])

  return null
}
