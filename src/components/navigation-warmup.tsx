'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'

const WARM_REFRESH_MS = 4 * 60 * 1000
const CORE_ROUTES = ['/', '/parts', '/stores', '/support'] as const

export function NavigationWarmup() {
  const router = useRouter()
  const role = useAppStore((state) => state.user?.role)

  useEffect(() => {
    const warm = () => CORE_ROUTES.forEach((href) => router.prefetch(href))
    warm()

    // Keep the visible, low-cardinality main navigation hot immediately. Role
    // dashboards are lower priority and are warmed only after the browser is
    // idle so they cannot compete with first paint on slower phones.
    const roleRoutes: string[] = []
    if (role === 'BUYER' || role === 'SHOP_OWNER') {
      roleRoutes.push('/account/orders', '/account/profile', '/account/wishlist')
    }
    if (role === 'SHOP_OWNER') {
      roleRoutes.push('/seller/parts', '/seller/orders', '/seller/store')
    }
    if (role === 'ADMIN') {
      roleRoutes.push('/admin/users', '/admin/parts', '/admin/support')
    }

    let cancelled = false
    const warmRoleRoutes = () => {
      if (!cancelled) roleRoutes.forEach((href) => router.prefetch(href))
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const usesIdleCallback = typeof idleWindow.requestIdleCallback === 'function'
    const idleHandle = roleRoutes.length
      ? usesIdleCallback
        ? idleWindow.requestIdleCallback!(warmRoleRoutes, { timeout: 2500 })
        : window.setTimeout(warmRoleRoutes, 1800)
      : 0

    const interval = window.setInterval(warm, WARM_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      if (!idleHandle) return
      if (usesIdleCallback && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleHandle)
      else window.clearTimeout(idleHandle)
    }
  }, [role, router])

  return null
}
