const CONDITION_ALIASES = new Map<string, string>([
  ['new', 'جديد'],
  ['جديد', 'جديد'],
  ['new import', 'استيراد جديد'],
  ['import new', 'استيراد جديد'],
  ['استيراد جديد', 'استيراد جديد'],
  ['used', 'مستعمل'],
  ['مستعمل', 'مستعمل'],
  ['used import', 'استيراد مستعمل'],
  ['import used', 'استيراد مستعمل'],
  ['استيراد مستعمل', 'استيراد مستعمل'],
  ['refurbished', 'مجدد'],
  ['reconditioned', 'مجدد'],
  ['مجدد', 'مجدد'],
])

export function normalizeProductCondition(value: unknown) {
  if (typeof value !== 'string') return ''
  const clean = value.trim().replace(/\s+/g, ' ')
  return CONDITION_ALIASES.get(clean.toLocaleLowerCase('en')) || clean
}

export function schemaConditionUrl(value: unknown) {
  const condition = normalizeProductCondition(value)
  if (condition === 'جديد' || condition === 'استيراد جديد') return 'https://schema.org/NewCondition'
  if (condition === 'مستعمل' || condition === 'استيراد مستعمل') return 'https://schema.org/UsedCondition'
  if (condition === 'مجدد') return 'https://schema.org/RefurbishedCondition'
  return undefined
}
