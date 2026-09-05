'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { pushDashboardTab, type DashboardArea } from '@/lib/instant-dashboard-navigation'
import { viewToPath, type View } from '@/lib/store'

function dashboardTarget(path: string): { area: DashboardArea; tab: string } | null {
  const match = path.match(/^\/(seller|admin)\/([^/?#]+)$/)
  if (!match) return null
  return { area: match[1] as DashboardArea, tab: decodeURIComponent(match[2]) }
}

/** Programmatic navigation for actions that cannot be expressed as a Link. */
export function useAppNavigation() {
  const router = useRouter()
  return useCallback((view: View) => {
    const path = viewToPath(view)
    const dashboard = dashboardTarget(path)
    if (dashboard) {
      pushDashboardTab(dashboard.area, dashboard.tab)
      return
    }
    router.push(path)
  }, [router])
}
