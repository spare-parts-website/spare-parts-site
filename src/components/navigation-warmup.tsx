'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'

// Refresh before the five-minute client router stale window expires. This is
// intentionally infrequent: it keeps the high-frequency route payloads hot
// without competing with the initial mobile LCP for bandwidth or main-thread time.
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

    let cancelled = false
    let interval: number | null = null
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null

    const warm = () => routes.forEach((href) => router.prefetch(href))
    const beginWarmup = () => {
      if (cancelled) return
      const run = () => {
        if (cancelled) return
        warm()
        interval = window.setInterval(warm, WARM_REFRESH_MS)
      }
      const idleWindow = window as typeof window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(run, { timeout: 1200 })
      } else {
        timeoutHandle = window.setTimeout(run, 700)
      }
    }

    if (document.readyState === 'complete') beginWarmup()
    else window.addEventListener('load', beginWarmup, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', beginWarmup)
      if (interval !== null) window.clearInterval(interval)
      const idleWindow = window as typeof window & { cancelIdleCallback?: (handle: number) => void }
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleHandle)
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle)
    }
  }, [role, router])

  return null
}
