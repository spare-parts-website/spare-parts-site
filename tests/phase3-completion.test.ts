import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('phase 3 high-volume read models use bounded cursor pagination', () => {
  const threads = read('src/app/api/chat/threads/route.ts')
  assert.match(threads, /decodeCursor/)
  assert.match(threads, /encodeCursor/)
  assert.match(threads, /LIMIT \$\{limit \+ 1\}/)
  for (const path of ['src/app/api/admin/users/route.ts', 'src/app/api/admin/stores/route.ts', 'src/app/api/admin/parts/route.ts', 'src/app/api/orders/list/route.ts']) {
    const source = read(path)
    assert.match(source, /decodeCursor/)
    assert.match(source, /nextCursor/)
  }
})

test('chat GET is read-only and read acknowledgement is explicit', () => {
  const source = read('src/app/api/chat/route.ts')
  const getSection = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function PATCH'))
  assert.doesNotMatch(getSection, /updateMany|\.update\(/)
  const patchSection = source.slice(source.indexOf('export async function PATCH'), source.indexOf('export async function POST'))
  assert.match(patchSection, /updateMany/)
})

test('inbox consumers can reach older pages without quiet-refresh cursor rewind', () => {
  for (const path of ['src/components/views/inbox-view.tsx', 'src/components/views/shop-messages-view.tsx']) {
    const source = read(path)
    assert.match(source, /تحميل المزيد/)
    assert.match(source, /loadedMoreRef/)
    assert.match(source, /quiet/)
    assert.match(source, /cursorRef/)
  }
})

test('shared operations state and migration are non-destructive', () => {
  const health = read('src/lib/ai/provider-health-persistence.ts')
  const alerts = read('src/lib/operational-alerts.ts')
  const migration = read('supabase/migrations/20260907013000_p0_p3_reconciliation.sql')
  assert.match(health, /AIProviderHealth/)
  assert.match(alerts, /OperationalAlertDedup/)
  assert.match(migration, /AIProviderHealth/)
  assert.match(migration, /OperationalAlertDedup/)
  assert.doesNotMatch(migration, /DELETE FROM public\."EmailOutbox" WHERE "fromEmail" IS NULL/)
})

test('release gate includes locked build plus browser CSP and axe checks', () => {
  const ci = read('.github/workflows/ci.yml')
  const browser = read('scripts/browser-release-gate.mjs')
  assert.match(ci, /npm ci/)
  assert.match(ci, /npm run build/)
  assert.match(ci, /@playwright\/test@1\.55\.0/)
  assert.match(ci, /@axe-core\/playwright@4\.10\.2/)
  assert.match(browser, /content-security-policy/)
  assert.match(browser, /AxeBuilder/)
  assert.match(browser, /browser\.newContext\(\)/)
  assert.match(browser, /hydration/)
})
