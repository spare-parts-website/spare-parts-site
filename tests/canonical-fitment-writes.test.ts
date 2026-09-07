import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('part mutation paths persist structured fitment only', () => {
  const mutationSources = [
    read('src/app/api/parts/route.ts'),
    read('src/app/api/admin/parts/route.ts'),
    read('src/lib/ai/actions.ts'),
  ]

  for (const source of mutationSources) {
    assert.doesNotMatch(source, /serializeLegacyCompatibility/)
    assert.match(source, /parseVehicleCompatibility/)
  }
})

test('legacy car-model input remains an input compatibility fallback, not a second write target', () => {
  const sellerRoute = read('src/app/api/parts/route.ts')
  const adminRoute = read('src/app/api/admin/parts/route.ts')

  assert.match(sellerRoute, /compatibilityEntries !== undefined \? compatibilityEntries : carModels/)
  assert.match(adminRoute, /body\.compatibilities !== undefined \? body\.compatibilities : body\.carModels/)
  assert.match(sellerRoute, /compatibilities: compatibilities\?\.length \? \{ create: compatibilities \} : undefined/)
  assert.match(adminRoute, /compatibilities: compatibilities\.length \? \{ create: compatibilities \} : undefined/)
})
