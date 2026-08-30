const SYNONYMS: Record<string, string> = {
  engine: 'engine', motor: 'engine', moteur: 'engine',
  'محرك': 'engine', 'موتور': 'engine', 'ماكينه': 'engine', 'مكينة': 'engine',
}

export function normalizePartSearch(value: string) {
  return rawTokens(value).map((token) => SYNONYMS[token] || token)
}

function rawTokens(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function fuzzyPartScore(query: string, candidate: string) {
  const queryTokens = normalizePartSearch(query)
  const candidateTokens = normalizePartSearch(candidate)
  const rawQueryTokens = rawTokens(query)
  const rawCandidateTokens = rawTokens(candidate)
  if (!queryTokens.length || !candidateTokens.length) return 0
  let score = 0
  for (const [index, queryToken] of queryTokens.entries()) {
    const rawQueryToken = rawQueryTokens[index]
    const distances = candidateTokens.map((candidateToken, candidateIndex) => Math.min(
      tokenDistance(queryToken, candidateToken),
      tokenDistance(rawQueryToken, rawCandidateTokens[candidateIndex]),
    ))
    const distance = Math.min(...distances)
    const allowance = queryToken.length >= 8 ? 2 : queryToken.length >= 3 ? 1 : 0
    if (distance > allowance) return 0
    score += distance === 0 ? 3 : distance === 1 ? 2 : 1
  }
  return score / queryTokens.length
}

function tokenDistance(left: string, right: string) {
  if (left === right) return 0
  if (left.length === right.length) {
    const mismatches = [...left].map((character, index) => character === right[index] ? -1 : index).filter((index) => index >= 0)
    if (mismatches.length === 2 && mismatches[1] === mismatches[0] + 1 && left[mismatches[0]] === right[mismatches[1]] && left[mismatches[1]] === right[mismatches[0]]) return 1
  }
  if (Math.abs(left.length - right.length) > 2) return 3
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index)
  for (let column = 1; column <= right.length; column += 1) {
    let previous = rows[0]
    rows[0] = column
    for (let row = 1; row <= left.length; row += 1) {
      const current = rows[row]
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + (left[row - 1] === right[column - 1] ? 0 : 1))
      previous = current
    }
  }
  return rows[left.length]
}
