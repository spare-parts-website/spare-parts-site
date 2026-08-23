import { NextResponse } from 'next/server'
import type { ModelMessage } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { searchInternet } from '@/lib/ai/tools'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIConcurrency, aiMode, aiQuota, AI_MESSAGE_LIMIT, releaseAIConcurrency } from '@/lib/ai/runtime'
import { AI_ENTITY_KINDS, type AIClientContext, type AIRole, type AIToolCard } from '@/lib/ai/types'

export const maxDuration = 60

type GuestHistory = Array<{ role?: unknown; content?: unknown }>

export async function POST(request: Request) {
  let concurrencyToken = ''
  let hasImage = false
  try {
    const body = await request.json() as { message?: unknown; conversationId?: unknown; history?: unknown; clientContext?: unknown; mode?: unknown; attachments?: unknown }
    hasImage = Array.isArray(body.attachments) && body.attachments.length > 0
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > AI_MESSAGE_LIMIT) return NextResponse.json({ error: 'اكتب رسالة صحيحة بحد أقصى 4000 حرف' }, { status: 400 })

    const user = await getSession()
    const role: AIRole = user?.role || 'GUEST'
    const attachments = await loadAIAttachments(body.attachments, user?.id)
    const selectedMode = attachments.length ? 'deep' : aiMode(body.mode)
    const liveSearchCard = selectedMode === 'fast' && shouldPrefetchLiveSearch(message) ? await searchInternet(message) : undefined
    const modelMessage = liveSearchCard ? `${message}\n\n${liveSearchContext(liveSearchCard)}` : message
    const address = requestAddress(request)
    const concurrencyKey = `ai:${user?.id || address}`
    const quotaKeys = user ? [`ai-hour:user:${role}:${user.id}`, `ai-hour:ip:${role}:${address}`] : [`ai-hour:guest:${address}`]
    const limits = await Promise.all(quotaKeys.map((key) => rateLimit(key, aiQuota(role), 60 * 60 * 1000)))
    const denied = limits.find((limit) => !limit.allowed)
    if (denied) return NextResponse.json({ error: 'وصلت للحد المؤقت لاستخدام المساعد. حاول بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(denied.retryAfter) } })
    concurrencyToken = await acquireAIConcurrency(concurrencyKey, role) || ''
    if (!concurrencyToken) return NextResponse.json({ error: 'لديك طلب آخر قيد التنفيذ. انتظر لحظة وحاول مجدداً.' }, { status: 429, headers: { 'Retry-After': '5' } })

    void purgeExpiredAIData().catch((error) => console.error('AI cleanup error:', error))
    let conversationId: string | undefined
    let expiresAt: string | undefined
    let modelMessages: ModelMessage[]

    if (user) {
      const conversation = await getOrCreateConversation({ conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined, user, firstMessage: message })
      conversationId = conversation.id
      expiresAt = conversation.expiresAt.toISOString()
      const previous = await loadConversationMessages(conversation.id, user)
      modelMessages = [...previous.map((item) => ({ role: item.role === 'assistant' ? 'assistant' as const : 'user' as const, content: item.content })), userMessage(modelMessage, attachments)]
      await appendAIMessage({ conversationId: conversation.id, role: 'user', content: message })
    } else {
      if (attachments.length) throw new Error('AI_IMAGE_FORBIDDEN')
      modelMessages = [...safeGuestHistory(body.history), { role: 'user', content: modelMessage }]
    }

    const agent = createGhyarAgent({
      role,
      user,
      conversationId,
      clientContext: safeClientContext(body.clientContext),
      mode: selectedMode,
      visualAnalysis: attachments.length > 0,
    })
    const result = await agent.generate({ messages: modelMessages, timeout: { totalMs: 50_000 } })
    const cards = [
      ...(liveSearchCard ? [liveSearchCard] : []),
      ...result.steps.flatMap((step) => step.toolResults.map((toolResult) => toolResult.output)).filter(isToolCard),
    ]
    const baseAnswer = result.text.trim() || (cards.length ? 'جهزت لك النتائج المطلوبة. راجع التفاصيل بالأسفل.' : 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.')
    const answer = appendWebSources(baseAnswer, result.sources)

    if (user && conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { cards } })
    return NextResponse.json({ conversationId, answer, cards, expiresAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('AI request failed:', {
      message,
      name: error instanceof Error ? error.name : 'UnknownError',
      cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
      hasImage,
    })
    if (message === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ error: 'انتهت المحادثة. ابدأ محادثة جديدة.' }, { status: 410 })
    if (['ACTION_FORBIDDEN', 'NAVIGATION_FORBIDDEN', 'DRAFT_FORBIDDEN'].includes(message)) return NextResponse.json({ error: 'هذا الطلب غير متاح لصلاحية حسابك.' }, { status: 403 })
    if (['INVALID_ACTION_INPUT', 'PART_NOT_OWNED'].includes(message)) return NextResponse.json({ error: 'تعذر تجهيز الإجراء لأن البيانات غير صالحة أو لم تعد متاحة.' }, { status: 400 })
    if (['AI_IMAGE_FORBIDDEN', 'AI_IMAGE_INVALID'].includes(message)) return NextResponse.json({ error: 'تعذر استخدام الصورة. ارفعها من زر الصور داخل المحادثة.' }, { status: 400 })
    return NextResponse.json({ error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.' }, { status: 503 })
  } finally {
    if (concurrencyToken) await releaseAIConcurrency(concurrencyToken).catch((error) => console.error('AI concurrency release error:', error))
  }
}

function appendWebSources(answer: string, sources: Array<{ sourceType: string; url?: string; title?: string }>) {
  const uniqueSources = [...new Map(sources
    .filter((source): source is { sourceType: string; url: string; title?: string } => source.sourceType === 'url' && typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .map((source) => [source.url, source])).values()].slice(0, 5)
  if (!uniqueSources.length) return answer
  const links = uniqueSources.map((source, index) => `- [${escapeMarkdownLabel(source.title?.trim() || `مصدر ${index + 1}`)}](${source.url})`).join('\n')
  return `${answer}\n\nالمصادر:\n\n${links}`
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\[\]]/g, '').slice(0, 120)
}

function shouldPrefetchLiveSearch(message: string) {
  return /\b(price|cost|how much|current|latest|new price)\b|سعر|كام|بكام|احدث|أحدث|اليوم|حالي/i.test(message)
}

function liveSearchContext(card: AIToolCard) {
  const results = card.items?.map((item) => `- ${item.title}: ${item.subtitle || ''} ${item.href || ''}`).join('\n') || ''
  return `نتائج بحث الإنترنت الحالية (استخدمها للإجابة ولا تخترع سعراً):\n${card.description || ''}\n${results}`
}

function userMessage(message: string, attachments: Array<{ path: string; data: Uint8Array }>): ModelMessage {
  if (!attachments.length) return { role: 'user', content: message }
  return { role: 'user', content: [{ type: 'text', text: message }, ...attachments.map((attachment) => ({ type: 'file' as const, mediaType: 'image/webp', filename: attachment.path, data: { type: 'data' as const, data: attachment.data } }))] }
}

async function loadAIAttachments(value: unknown, userId?: string) {
  if (!Array.isArray(value) || !value.length) return []
  if (!userId || value.length > 3) throw new Error('AI_IMAGE_FORBIDDEN')
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('AI_UNAVAILABLE')
  const paths = value.flatMap((item) => typeof item === 'string' ? [item] : [])
  if (paths.length !== value.length || new Set(paths).size !== paths.length || paths.some((path) => !/^ai-[A-Za-z0-9._-]+\.webp$/.test(path) || !path.includes(`-${userId}-`))) throw new Error('AI_IMAGE_INVALID')
  return Promise.all(paths.map(async (path) => {
    const response = await fetch(`${base}/storage/v1/object/protected-uploads/${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${key}`, apikey: key }, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error('AI_IMAGE_INVALID')
    const data = new Uint8Array(await response.arrayBuffer())
    if (!data.length || data.length > 1024 * 1024) throw new Error('AI_IMAGE_INVALID')
    return { path, data }
  }))
}

function safeClientContext(value: unknown): AIClientContext {
  const cart = value && typeof value === 'object' && Array.isArray((value as { cart?: unknown }).cart) ? (value as { cart: unknown[] }).cart : []
  const rawSelection = value && typeof value === 'object' ? (value as { selection?: unknown }).selection : undefined
  const selection = rawSelection && typeof rawSelection === 'object' ? rawSelection as Record<string, unknown> : null
  const kind = selection && AI_ENTITY_KINDS.includes(selection.kind as (typeof AI_ENTITY_KINDS)[number]) ? selection.kind as (typeof AI_ENTITY_KINDS)[number] : undefined
  const id = typeof selection?.id === 'string' ? selection.id.slice(0, 100) : ''
  const label = typeof selection?.label === 'string' ? selection.label.trim().slice(0, 160) : ''
  return { cart: cart.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const partId = typeof item.partId === 'string' ? item.partId.slice(0, 100) : ''
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 160) : ''
    const quantity = Number(item.quantity)
    const price = Number(item.price)
    if (!partId || !name || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return []
    return [{ partId, name, quantity: Math.min(quantity, 1000), price: Math.min(price, 100000000) }]
  }), ...(kind && id && label ? { selection: { kind, id, label } } : {}) }
}

function safeGuestHistory(value: unknown): ModelMessage[] {
  if (!Array.isArray(value)) return []
  return (value as GuestHistory).slice(-12).flatMap((item) => {
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, AI_MESSAGE_LIMIT) : ''
    if (!content || !['user', 'assistant'].includes(String(item.role))) return []
    return [{ role: item.role === 'assistant' ? 'assistant' as const : 'user' as const, content }]
  })
}

function isToolCard(value: unknown): value is AIToolCard {
  if (!value || typeof value !== 'object') return false
  return ['results', 'insight', 'navigation', 'draft', 'proposal'].includes(String((value as { type?: unknown }).type))
}
