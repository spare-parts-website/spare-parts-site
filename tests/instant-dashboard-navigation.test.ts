import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('switches seller and admin dashboard tabs without a server route transition', () => {
  const tabs = readFileSync(new URL('../src/components/ui/tabs.tsx', import.meta.url), 'utf8')
  const helper = readFileSync(new URL('../src/lib/instant-dashboard-navigation.ts', import.meta.url), 'utf8')
  const seller = readFileSync(new URL('../src/components/views/shop-dashboard-view.tsx', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../src/components/views/admin-dashboard-view.tsx', import.meta.url), 'utf8')

  assert.match(tabs, /currentDashboardArea/)
  assert.match(tabs, /pushDashboardTab\(dashboardArea, value\)/)
  assert.match(tabs, /pathname\.startsWith\("\/seller\/"\)/)
  assert.match(tabs, /pathname\.startsWith\("\/admin\/"\)/)
  assert.match(helper, /window\.history\.pushState/)
  assert.match(helper, /encodeURIComponent\(tab\)/)
  assert.match(seller, /pushDashboardTab\('seller', v\)/)

  // Admin can keep its existing router callback: the shared Tabs wrapper
  // intercepts dashboard tab changes first, updates usePathname immediately,
  // and intentionally does not call the router callback for dashboard tabs.
  assert.match(admin, /router\.push\(`\/admin\/\$\{v\}`\)/)
})

test('warms private dashboard data and reuses short-lived user-scoped caches', () => {
  const shell = readFileSync(new URL('../src/components/app-shell.tsx', import.meta.url), 'utf8')
  const warmup = readFileSync(new URL('../src/lib/dashboard-warmup.ts', import.meta.url), 'utf8')
  const sellerCache = readFileSync(new URL('../src/lib/seller-dashboard-cache.ts', import.meta.url), 'utf8')
  const analytics = readFileSync(new URL('../src/components/views/analytics-view.tsx', import.meta.url), 'utf8')
  const coupons = readFileSync(new URL('../src/components/views/coupons-view.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/components/views/shop-messages-view.tsx', import.meta.url), 'utf8')
  const support = readFileSync(new URL('../src/components/views/support-view.tsx', import.meta.url), 'utf8')

  assert.match(shell, /requestIdleCallback/)
  assert.match(shell, /dashboard-warmup/)
  assert.match(warmup, /Promise\.allSettled/)
  assert.match(warmup, /warmSellerCore/)
  assert.match(warmup, /warmSellerAnalytics/)
  assert.match(warmup, /warmSellerCoupons/)
  assert.match(warmup, /warmSellerMessages/)
  assert.match(sellerCache, /SELLER_CACHE_TTL/)
  assert.match(sellerCache, /inFlight/)
  assert.match(analytics, /analyticsCache/)
  assert.match(coupons, /couponCache/)
  assert.match(messages, /messageCache/)
  assert.match(support, /warmSupportTickets/)
})
