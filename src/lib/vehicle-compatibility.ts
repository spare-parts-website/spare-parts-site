export type CompatibilityInput = {
  make: string
  model: string
  generation?: string | null
  yearFrom?: number | null
  yearTo?: number | null
  engine?: string | null
  trim?: string | null
  notes?: string | null
}

export type VehicleProfile = {
  brand: string
  model: string
  generation?: string | null
  year?: number | null
  engine?: string | null
  trim?: string | null
}

export type FitmentStatus = 'fits' | 'does-not-fit' | 'unknown'

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
    const key = [item.make, item.model, item.generation, item.yearFrom, item.yearTo, item.engine, item.trim]
      .map((part) => normalizeFitmentText(String(part || '')))
      .join('|')
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
    return clean({
      make: String(item.make || ''),
      model: String(item.model || ''),
      generation: item.generation,
      yearFrom: item.yearFrom,
      yearTo: item.yearTo,
      engine: item.engine,
      trim: item.trim,
      notes: item.notes,
    })
  }
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(/^([^\s]+)\s+(.+?)(?:\s+(\d{4})(?:\s*[-–]\s*(\d{4}))?)?$/)
  if (!match) return null
  return clean({ make: match[1], model: match[2], yearFrom: match[3], yearTo: match[4] })
}

function clean(value: Record<string, unknown>): CompatibilityInput | null {
  const make = String(value.make || '').trim().slice(0, 80)
  const model = String(value.model || '').trim().slice(0, 120)
  if (!make || !model) return null
  const yearFrom = validYear(value.yearFrom)
  const yearTo = validYear(value.yearTo)
  if (yearFrom && yearTo && yearFrom > yearTo) return null
  return {
    make,
    model,
    generation: optionalText(value.generation, 80),
    yearFrom,
    yearTo,
    engine: optionalText(value.engine, 80),
    trim: optionalText(value.trim, 80),
    notes: optionalText(value.notes, 300),
  }
}

function validYear(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const year = Number(value)
  return Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 2 ? year : null
}

function optionalText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) || null : null
}

export function normalizeFitmentText(value: string) {
  return value
    .toLocaleLowerCase('ar')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function formatCompatibility(item: CompatibilityInput) {
  const details = [
    item.generation,
    item.yearFrom ? `${item.yearFrom}${item.yearTo ? `–${item.yearTo}` : ''}` : null,
    item.engine,
    item.trim,
  ].filter(Boolean)
  return `${item.make} ${item.model}${details.length ? ` — ${details.join(' — ')}` : ''}`
}

export function evaluateFitment(
  part: { universal?: boolean; compatibilities?: CompatibilityInput[] | null },
  car: VehicleProfile | null | undefined,
): FitmentStatus {
  if (part.universal) return 'fits'
  if (!car) return 'unknown'
  const compatibilities = part.compatibilities || []
  if (!compatibilities.length) return 'unknown'

  const carMake = normalizeFitmentText(car.brand)
  const carModel = normalizeFitmentText(car.model)
  let hasPotentialUnknown = false

  for (const item of compatibilities) {
    if (normalizeFitmentText(item.make) !== carMake || normalizeFitmentText(item.model) !== carModel) continue
    const requiredText: Array<[string | null | undefined, string | null | undefined]> = [
      [item.generation, car.generation],
      [item.engine, car.engine],
      [item.trim, car.trim],
    ]
    let mismatch = false
    for (const [required, actual] of requiredText) {
      if (!required) continue
      if (!actual) {
        hasPotentialUnknown = true
        mismatch = true
        break
      }
      if (normalizeFitmentText(required) !== normalizeFitmentText(actual)) {
        mismatch = true
        break
      }
    }
    if (mismatch) continue
    if (item.yearFrom || item.yearTo) {
      if (!car.year) {
        hasPotentialUnknown = true
        continue
      }
      if ((item.yearFrom && car.year < item.yearFrom) || (item.yearTo && car.year > item.yearTo)) continue
    }
    return 'fits'
  }

  return hasPotentialUnknown ? 'unknown' : 'does-not-fit'
}
