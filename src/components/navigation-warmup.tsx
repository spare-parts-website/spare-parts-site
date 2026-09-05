'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'

function keepWarm(router: ReturnType<typeof useRouter>, href: string) {
  let cancelled = false
  const refresh = () => {
    if (cancelled) return
    router.prefetch(href, { onInvalidate: refresh })
  }
  refresh()
  return () => { cancelled = true }
}

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

    const cleanups = Array.from(routes, (href) => keepWarm(router, href))
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [role, router])

  return null
}
