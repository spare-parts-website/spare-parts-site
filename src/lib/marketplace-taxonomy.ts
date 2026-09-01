import { normalizeProductCondition } from './product-condition.ts'

type AliasMap = Record<string, string>

const BRAND_ALIASES: AliasMap = {
  bmw: 'BMW',
  'بي ام دبليو': 'BMW',
  'بى ام دبليو': 'BMW',
  mercedes: 'Mercedes',
  'mercedes-benz': 'Mercedes',
  مرسيدس: 'Mercedes',
  'مرسيدس بنز': 'Mercedes',
  toyota: 'Toyota',
  تويوتا: 'Toyota',
  hyundai: 'Hyundai',
  هيونداي: 'Hyundai',
  nissan: 'Nissan',
  نيسان: 'Nissan',
  kia: 'Kia',
  كيا: 'Kia',
  honda: 'Honda',
  هوندا: 'Honda',
  ford: 'Ford',
  فولكسفاجن: 'Volkswagen',
  volkswagen: 'Volkswagen',
  vw: 'Volkswagen',
  audi: 'Audi',
  اودي: 'Audi',
  volvo: 'Volvo',
  رينو: 'Renault',
  renault: 'Renault',
  peugeot: 'Peugeot',
  بيجو: 'Peugeot',
  mitsubishi: 'Mitsubishi',
  ميتسوبيشي: 'Mitsubishi',
  skoda: 'Skoda',
  سكودا: 'Skoda',
}

const CATEGORY_ALIASES: AliasMap = {
  engine: 'محرك',
  'car engine': 'محرك',
  محرك: 'محرك',
  موتور: 'محرك',
  brake: 'فرامل',
  brakes: 'فرامل',
  'brake system': 'فرامل',
  فرامل: 'فرامل',
  rim: 'جنط',
  rims: 'جنط',
  wheel: 'جنط',
  wheels: 'جنط',
  جنط: 'جنط',
  جنوط: 'جنط',
  bumper: 'اكصدام',
  'car bumper': 'اكصدام',
  اكصدام: 'اكصدام',
  صدام: 'اكصدام',
  dashboard: 'عداد سيارة',
  عداد: 'عداد سيارة',
  'عداد سيارة': 'عداد سيارة',
  'car part': 'قطع غيار',
  'spare part': 'قطع غيار',
  'spare parts': 'قطع غيار',
  'قطع غيار': 'قطع غيار',
}

function clean(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').slice(0, maxLength)
}

function aliasKey(value: string) {
  return value.toLocaleLowerCase('ar').replace(/\s*[-–]\s*/gu, '-')
}

function canonical(value: unknown, aliases: AliasMap, maxLength: number) {
  const cleaned = clean(value, maxLength)
  if (!cleaned) return ''
  return aliases[aliasKey(cleaned)] || cleaned
}

/** Canonical display value for seller/admin brand fields. */
export function normalizeMarketplaceBrand(value: unknown) {
  return canonical(value, BRAND_ALIASES, 120)
}

/** Canonical display value for seller/admin category fields. */
export function normalizeMarketplaceCategory(value: unknown) {
  return canonical(value, CATEGORY_ALIASES, 120)
}

/** Condition shares the existing Schema.org-safe aliases and whitespace rules. */
export function normalizeMarketplaceCondition(value: unknown) {
  return normalizeProductCondition(clean(value, 120))
}

export function normalizeMarketplaceTaxonomy(input: { brand?: unknown; category?: unknown; condition?: unknown }) {
  return {
    brand: normalizeMarketplaceBrand(input.brand) || null,
    category: normalizeMarketplaceCategory(input.category) || null,
    condition: normalizeMarketplaceCondition(input.condition) || null,
  }
}
