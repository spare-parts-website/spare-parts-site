import { randomUUID } from 'crypto'
import type { FileUIPart, UIMessage } from 'ai'
import type { SessionUser } from '@/lib/auth'

const SAFE_PRIVATE_PATH = /^[A-Za-z0-9._-]+$/
const ALLOWED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DATA_URL_LENGTH = 1_500_000

export type AIMessageMetadata = {
  conversationId?: string
  expiresAt?: string
  requestId?: string
  progress?: string
}

export type GhyarAIMessage = UIMessage<AIMessageMetadata>

export function textFromMessage(message: Pick<GhyarAIMessage, 'parts'>) {
  return message.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
}

export function storedMessageToUIMessage(message: { id: string; role: string; content: string; metadata: string | null }): GhyarAIMessage {
  const parsed = parseMetadata(message.metadata)
  const parts = Array.isArray(parsed?.parts) ? parsed.parts : [{ type: 'text', text: message.content }]
  return { id: message.id, role: message.role === 'assistant' ? 'assistant' : 'user', parts } as GhyarAIMessage
}

export function sanitizeIncomingUserMessage(value: unknown, user: SessionUser | null): GhyarAIMessage {
  if (!value || typeof value !== 'object') throw new Error('INVALID_AI_MESSAGE')
  const raw = value as { id?: unknown; role?: unknown; parts?: unknown }
  if (raw.role !== 'user' || !Array.isArray(raw.parts)) throw new Error('INVALID_AI_MESSAGE')
  const parts: GhyarAIMessage['parts'] = []
  let imageCount = 0
  for (const part of raw.parts) {
    if (!part || typeof part !== 'object') continue
    const candidate = part as Record<string, unknown>
    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      const text = candidate.text.trim().slice(0, 4000)
      if (text) parts.push({ type: 'text', text })
    }
    if (candidate.type === 'file' && imageCount === 0 && typeof candidate.url === 'string' && typeof candidate.mediaType === 'string' && ALLOWED_IMAGES.has(candidate.mediaType)) {
      const url = candidate.url
      if (user ? isOwnedPrivateImage(url, user.id) : isSafeImageDataUrl(url, candidate.mediaType)) {
        parts.push({ type: 'file', url, mediaType: candidate.mediaType, filename: typeof candidate.filename === 'string' ? candidate.filename.slice(0, 120) : 'image' })
        imageCount += 1
      }
    }
  }
  if (!parts.some((part) => part.type === 'text') && imageCount === 0) throw new Error('INVALID_AI_MESSAGE')
  return { id: typeof raw.id === 'string' && raw.id.length <= 100 ? raw.id : randomUUID(), role: 'user', parts }
}

export async function materializePrivateImages(messages: GhyarAIMessage[], user: SessionUser | null): Promise<GhyarAIMessage[]> {
  if (!user) return messages
  return Promise.all(messages.map(async (message) => ({ ...message, parts: await Promise.all(message.parts.map(async (part) => {
    if (part.type !== 'file' || !isOwnedPrivateImage(part.url, user.id)) return part
    return { ...part, url: await privateImageDataUrl(part.url, part.mediaType) }
  })) })))
}

export function attachmentUrls(messages: GhyarAIMessage[]) {
  return messages.flatMap((message) => message.parts.flatMap((part) => part.type === 'file' && part.url.startsWith('/api/private-image?path=') ? [part.url] : []))
}

export function compactConversationContext(messages: GhyarAIMessage[]): GhyarAIMessage[] {
  return messages.slice(-20).flatMap((message) => {
    const parts = message.parts.filter((part) => part.type === 'text' || part.type === 'file')
    return parts.length ? [{ ...message, parts }] : []
  })
}

function parseMetadata(value: string | null): { parts?: GhyarAIMessage['parts'] } | null {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function isOwnedPrivateImage(url: string, userId: string) {
  if (!url.startsWith('/api/private-image?path=')) return false
  const path = decodeURIComponent(url.slice('/api/private-image?path='.length))
  return SAFE_PRIVATE_PATH.test(path) && path.startsWith(`chat-${userId}-`)
}

function isSafeImageDataUrl(url: string, mediaType: string) {
  return url.length <= MAX_DATA_URL_LENGTH && url.startsWith(`data:${mediaType};base64,`) && /^[A-Za-z0-9+/=]+$/.test(url.slice(url.indexOf(',') + 1))
}

async function privateImageDataUrl(url: string, mediaType: string) {
  const path = decodeURIComponent(url.slice('/api/private-image?path='.length))
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('AI_IMAGE_UNAVAILABLE')
  const response = await fetch(`${base}/storage/v1/object/protected-uploads/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key }, cache: 'no-store' })
  if (!response.ok) throw new Error('AI_IMAGE_UNAVAILABLE')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length || bytes.length > 1_100_000) throw new Error('AI_IMAGE_UNAVAILABLE')
  return `data:${mediaType};base64,${bytes.toString('base64')}`
}
