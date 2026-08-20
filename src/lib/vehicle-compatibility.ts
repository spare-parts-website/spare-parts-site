export type CompatibilityInput = { make: string; model: string; yearFrom?: number | null; yearTo?: number | null }

export function parseVehicleCompatibility(value: unknown): CompatibilityInput[] {
  const rawItems: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? parseLegacyString(value)
      : []
  const seen = new Set<string>()
  const result: CompatibilityInput[] = []

  for (const raw of rawItems.slice(0, 50)) {
    const item = normalizeItem(raw)
    if (!item) continue
    const key = `${item.make.toLocaleLowerCase('ar')}|${item.model.toLocaleLowerCase('ar')}|${item.yearFrom || ''}|${item.yearTo || ''}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

export function serializeLegacyCompatibility(value: unknown) {
  if (typeof value === 'string') return value.trim().slice(0, 5000) || null
  const items = parseVehicleCompatibility(value)
  return items.length
    ? items.map((item) => `${item.make} ${item.model}${item.yearFrom ? ` ${item.yearFrom}${item.yearTo ? `-${item.yearTo}` : ''}` : ''}`).join(', ')
    : null
}

function parseLegacyString(value: string): unknown[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Legacy seller input is frequently newline- or comma-separated text.
  }
  return trimmed.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function normalizeItem(raw: unknown): CompatibilityInput | null {
  if (raw && typeof raw === 'object') {
    const item = raw as Record<string, unknown>
    return clean(String(item.make || ''), String(item.model || ''), item.yearFrom, item.yearTo)
  }
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(/^([^\s]+)\s+(.+?)(?:\s+(\d{4})(?:\s*[-–]\s*(\d{4}))?)?$/)
  if (!match) return null
  return clean(match[1], match[2], match[3], match[4])
}

function clean(makeValue: string, modelValue: string, fromValue: unknown, toValue: unknown): CompatibilityInput | null {
  const make = makeValue.trim().slice(0, 80)
  const model = modelValue.trim().slice(0, 120)
  if (!make || !model) return null
  const yearFrom = validYear(fromValue)
  const yearTo = validYear(toValue)
  if (yearFrom && yearTo && yearFrom > yearTo) return null
  return { make, model, yearFrom, yearTo }
}

function validYear(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const year = Number(value)
  return Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 2 ? year : null
}
