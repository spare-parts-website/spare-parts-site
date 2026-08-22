const KEY = 'ghyar-ai-draft-v1'

export function consumeAIDraft(target: string) {
  if (typeof window === 'undefined') return null
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(KEY) || 'null') as { target?: string; fields?: Record<string, string | number | boolean>; createdAt?: number } | null
    if (!draft || draft.target !== target || !draft.createdAt || Date.now() - draft.createdAt > 60 * 60 * 1000) return null
    window.sessionStorage.removeItem(KEY)
    return draft.fields || null
  } catch {
    window.sessionStorage.removeItem(KEY)
    return null
  }
}

export function subscribeAIDraft(target: string, apply: (fields: Record<string, string | number | boolean>) => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ target?: string; fields?: Record<string, string | number | boolean> }>).detail
    if (detail?.target === target && detail.fields) apply(detail.fields)
  }
  window.addEventListener('ghyar-ai-draft', listener)
  const stored = consumeAIDraft(target)
  if (stored) apply(stored)
  return () => window.removeEventListener('ghyar-ai-draft', listener)
}
