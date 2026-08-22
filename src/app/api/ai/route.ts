import { NextResponse } from 'next/server'
import type { ModelMessage } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIConcurrency, aiQuota, AI_MESSAGE_LIMIT, releaseAIConcurrency } from '@/lib/ai/runtime'
import type { AIClientContext, AIRole, AIToolCard } from '@/lib/ai/types'

export const maxDuration = 60

type GuestHistory = Array<{ role?: unknown; content?: unknown }>

export async function POST(request: Request) {
  let concurrencyToken = ''
  try {
    const body = await request.json() as { message?: unknown; conversationId?: unknown; history?: unknown; clientContext?: unknown }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > AI_MESSAGE_LIMIT) return NextResponse.json({ error: 'اكتب رسالة صحيحة بحد أقصى 4000 حرف' }, { status: 400 })

    const user = await getSession()
    const role: AIRole = user?.role || 'GUEST'
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
      modelMessages = [...previous.map((item) => ({ role: item.role === 'assistant' ? 'assistant' as const : 'user' as const, content: item.content })), { role: 'user', content: message }]
      await appendAIMessage({ conversationId: conversation.id, role: 'user', content: message })
    } else {
      modelMessages = [...safeGuestHistory(body.history), { role: 'user', content: message }]
    }

    const agent = createGhyarAgent({ role, user, conversationId, clientContext: safeClientContext(body.clientContext) })
    const result = await agent.generate({ messages: modelMessages, timeout: { totalMs: 50_000 } })
    const cards = result.steps.flatMap((step) => step.toolResults.map((toolResult) => toolResult.output)).filter(isToolCard)
    const answer = result.text.trim() || (cards.length ? 'جهزت لك النتائج المطلوبة. راجع التفاصيل بالأسفل.' : 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.')

    if (user && conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { cards } })
    return NextResponse.json({ conversationId, answer, cards, expiresAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('AI request failed:', error)
    if (message === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ error: 'انتهت المحادثة. ابدأ محادثة جديدة.' }, { status: 410 })
    if (['ACTION_FORBIDDEN', 'NAVIGATION_FORBIDDEN', 'DRAFT_FORBIDDEN'].includes(message)) return NextResponse.json({ error: 'هذا الطلب غير متاح لصلاحية حسابك.' }, { status: 403 })
    if (['INVALID_ACTION_INPUT', 'PART_NOT_OWNED'].includes(message)) return NextResponse.json({ error: 'تعذر تجهيز الإجراء لأن البيانات غير صالحة أو لم تعد متاحة.' }, { status: 400 })
    return NextResponse.json({ error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.' }, { status: 503 })
  } finally {
    if (concurrencyToken) await releaseAIConcurrency(concurrencyToken).catch((error) => console.error('AI concurrency release error:', error))
  }
}

function safeClientContext(value: unknown): AIClientContext {
  const cart = value && typeof value === 'object' && Array.isArray((value as { cart?: unknown }).cart) ? (value as { cart: unknown[] }).cart : []
  return { cart: cart.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const partId = typeof item.partId === 'string' ? item.partId.slice(0, 100) : ''
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 160) : ''
    const quantity = Number(item.quantity)
    const price = Number(item.price)
    if (!partId || !name || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return []
    return [{ partId, name, quantity: Math.min(quantity, 1000), price: Math.min(price, 100000000) }]
  }) }
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
