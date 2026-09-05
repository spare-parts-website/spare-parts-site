export type DashboardArea = 'seller' | 'admin'

/**
 * Switch between tabs that are already represented by one persistent client
 * dashboard without waiting for a new server render. Next patches the native
 * History API, so usePathname/useSearchParams stay in sync and Back/Forward
 * continue to work. Direct visits and reloads still render the matching route.
 */
export function pushDashboardTab(area: DashboardArea, tab: string) {
  if (typeof window === 'undefined') return
  const nextPath = `/${area}/${encodeURIComponent(tab)}`
  if (window.location.pathname === nextPath && !window.location.search && !window.location.hash) return
  window.history.pushState(null, '', nextPath)
}
