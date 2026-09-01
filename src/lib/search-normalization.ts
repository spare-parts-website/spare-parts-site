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

function editDistanceAtMost(left: string, right: string, maxDistance: number) {
  if (left === right) return 0
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    let rowMinimum = row
    for (let column = 1; column <= right.length; column += 1) {
      const value = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
      current[column] = value
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > maxDistance) return maxDistance + 1
    previous = current
  }
  return previous[right.length]
}

function addAutomotiveTypoVariants(base: string, variants: Set<string>) {
  const tokens = base.split(' ')
  if (!tokens.some((token) => token.length >= 3)) return

  for (const [tokenIndex, token] of tokens.entries()) {
    if (token.length < 3) continue
    const allowance = token.length >= 8 ? 2 : 1
    for (const group of AUTOMOTIVE_SYNONYMS) {
      const match = group
        .map((term) => ({ term: normalizeMarketplaceSearch(term), distance: editDistanceAtMost(token, normalizeMarketplaceSearch(term), allowance) }))
        .filter(({ distance }) => distance <= allowance)
        .sort((left, right) => left.distance - right.distance || left.term.length - right.term.length)[0]
      if (!match || match.term === token) continue

      const replacement = group[0]
      const replacementTokens = replacement.split(' ')
      const nextTokens = [...tokens]
      nextTokens.splice(tokenIndex, 1, ...replacementTokens)
      variants.add(nextTokens.join(' '))
      if (variants.size >= 8) return
    }
  }
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
  addAutomotiveTypoVariants(base, variants)
  return Array.from(variants).filter((query) => query.length >= 2)
}
