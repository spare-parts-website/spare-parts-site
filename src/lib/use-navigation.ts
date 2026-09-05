'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { pushDashboardTab, type DashboardArea } from '@/lib/instant-dashboard-navigation'
import { viewToPath, type View } from '@/lib/store'

function dashboardTarget(path: string): { area: DashboardArea; tab: string } | null {
  const match = path.match(/^\/(seller|admin)\/([^/?#]+)$/)
  if (!match) return null
  return { area: match[1] as DashboardArea, tab: decodeURIComponent(match[2]) }
}

function isInsideDashboard(pathname: string, area: DashboardArea) {
  return pathname === `/${area}` || pathname.startsWith(`/${area}/`)
}

/** Programmatic navigation for actions that cannot be expressed as a Link. */
export function useAppNavigation() {
  const router = useRouter()
  const pathname = usePathname() || '/'
  return useCallback((view: View) => {
    const path = viewToPath(view)
    const dashboard = dashboardTarget(path)
    if (dashboard && isInsideDashboard(pathname, dashboard.area)) {
      // History-only switching is safe only while the matching dashboard tree
      // is already mounted. Entering seller/admin from another page still uses
      // the Next router so the protected server route is loaded and checked.
      pushDashboardTab(dashboard.area, dashboard.tab)
      return
    }
    router.push(path)
  }, [pathname, router])
}
