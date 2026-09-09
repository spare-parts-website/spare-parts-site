export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

type CursorPayload = { createdAt: string; id: string }

export function parseLimit(value: string | null, fallback = DEFAULT_PAGE_SIZE, max = MAX_PAGE_SIZE) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export function encodeCursor(value: { createdAt: Date | string; id: string }) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(value.createdAt).toISOString(), id: value.id } satisfies CursorPayload)).toString('base64url')
}

export function decodeCursor(value: string | null): CursorPayload | null {
  if (!value) return null
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorPayload>
    if (typeof decoded.createdAt !== 'string' || Number.isNaN(Date.parse(decoded.createdAt)) || typeof decoded.id !== 'string' || !decoded.id) return null
    return { createdAt: decoded.createdAt, id: decoded.id }
  } catch {
    return null
  }
}

export function keysetBefore(cursor: CursorPayload | null) {
  if (!cursor) return undefined
  const createdAt = new Date(cursor.createdAt)
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] }
}
