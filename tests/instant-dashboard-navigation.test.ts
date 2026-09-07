import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('switches seller and admin dashboard tabs immediately without a server route transition', () => {
  const tabs = readFileSync(new URL('../src/components/ui/tabs.tsx', import.meta.url), 'utf8')
  const helper = readFileSync(new URL('../src/lib/instant-dashboard-navigation.ts', import.meta.url), 'utf8')
  const navigation = readFileSync(new URL('../src/lib/use-navigation.ts', import.meta.url), 'utf8')
  const seller = readFileSync(new URL('../src/components/views/shop-dashboard-view.tsx', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../src/components/views/admin-dashboard-view.tsx', import.meta.url), 'utf8')

  assert.match(tabs, /currentDashboardArea/)
  assert.match(tabs, /flushSync\(\(\) => setDashboardValue\(nextValue\)\)/)
  assert.match(tabs, /value=\{dashboardValue \?\? controlledValue\}/)
  assert.match(tabs, /pushDashboardTab\(dashboardArea, nextValue\)/)
  assert.match(tabs, /pathname\.startsWith\("\/seller\/"\)/)
  assert.match(tabs, /pathname\.startsWith\("\/admin\/"\)/)
  assert.match(tabs, /transition-none/)
  assert.match(helper, /window\.history\.pushState/)
  assert.match(helper, /encodeURIComponent\(tab\)/)
  assert.doesNotMatch(helper, /scrollTo/)
  assert.match(seller, /pushDashboardTab\('seller', v\)/)
  assert.match(navigation, /dashboard && isInsideDashboard\(pathname, dashboard\.area\)/)
  assert.match(navigation, /router\.push\(path\)/)
  assert.match(admin, /router\.push\(`\/admin\/\$\{v\}`\)/)
})

test('loads private dashboard data on demand instead of fanning out after login', () => {
  const shell = readFileSync(new URL('../src/components/app-shell.tsx', import.meta.url), 'utf8')
  const warmup = readFileSync(new URL('../src/lib/dashboard-warmup.ts', import.meta.url), 'utf8')
  const sellerCache = readFileSync(new URL('../src/lib/seller-dashboard-cache.ts', import.meta.url), 'utf8')
  const analytics = readFileSync(new URL('../src/components/views/analytics-view.tsx', import.meta.url), 'utf8')
  const coupons = readFileSync(new URL('../src/components/views/coupons-view.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/components/views/shop-messages-view.tsx', import.meta.url), 'utf8')
  const support = readFileSync(new URL('../src/components/views/support-view.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(shell, /requestIdleCallback/)
  assert.doesNotMatch(shell, /import\(['"]@\/lib\/dashboard-warmup['"]\)/)
  assert.doesNotMatch(warmup, /Promise\.allSettled/)
  assert.match(warmup, /await warmSellerCore\(userId, currentTab\)/)
  assert.doesNotMatch(warmup, /^import .*analytics-view/m)
  assert.doesNotMatch(warmup, /^import .*coupons-view/m)
  assert.doesNotMatch(warmup, /^import .*shop-messages-view/m)
  assert.doesNotMatch(warmup, /^import .*support-view/m)
  assert.match(sellerCache, /SELLER_CACHE_TTL/)
  assert.match(sellerCache, /inFlight/)
  assert.match(analytics, /analyticsCache/)
  assert.match(coupons, /couponCache/)
  assert.match(messages, /messageCache/)
  assert.match(support, /api\/support\/tickets/)
  assert.doesNotMatch(support, /warmSupportTickets/)
})

test('keeps the current page visible instead of showing a route-wide loading screen', () => {
  assert.equal(existsSync(new URL('../src/app/loading.tsx', import.meta.url)), false)
})
