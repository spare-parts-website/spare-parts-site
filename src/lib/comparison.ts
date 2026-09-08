export const MAX_COMPARISON_ITEMS = 4

export function comparisonIds(value: string): string[] {
  return [...new Set(value.split(',').filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, MAX_COMPARISON_ITEMS)
}

export function toggleComparison(ids: string[], id: string): string[] {
  const clean = comparisonIds(ids.join(','))
  if (clean.includes(id)) return clean.filter(value => value !== id)
  if (clean.length >= MAX_COMPARISON_ITEMS || comparisonIds(id)[0] !== id) return clean
  return [...clean, id]
}
