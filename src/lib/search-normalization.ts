const DIACRITICS = /[\u064B-\u065F\u0670]/g

const AUTOMOTIVE_SYNONYMS = [
  ['engine', 'engin', 'motor', 'محرك', 'موتور', 'ماتور'],
  ['bmw', 'بي ام دبليو', 'بى ام دبليو'],
  ['mercedes', 'mercedes-benz', 'مرسيدس', 'مرسيدس بنز'],
  ['toyota', 'تويوتا'],
  ['brake', 'brakes', 'فرامل'],
  ['rim', 'rims', 'wheel', 'wheels', 'جنط', 'جنوط'],
] as const

export function normalizeMarketplaceSearch(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(DIACRITICS, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function replaceTerm(query: string, term: string, replacement: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return query.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'giu'), (match, prefix: string) => `${prefix}${replacement}`)
}

export function buildMarketplaceSearchQueries(value: string) {
  const base = normalizeMarketplaceSearch(value)
  if (!base) return []

  const variants = new Set([base])
  for (const group of AUTOMOTIVE_SYNONYMS) {
    const matched = group.find((term) => base === term || base.includes(` ${term} `) || base.startsWith(`${term} `) || base.endsWith(` ${term}`))
    if (!matched) continue
    for (const synonym of group) {
      variants.add(replaceTerm(base, matched, synonym))
      if (variants.size >= 8) break
    }
    if (variants.size >= 8) break
  }
  return Array.from(variants).filter((query) => query.length >= 2)
}
