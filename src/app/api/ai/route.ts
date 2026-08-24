import { NextResponse } from 'next/server'
import type { ModelMessage } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { searchInternet } from '@/lib/ai/tools'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIConcurrency, aiQuota, AI_MESSAGE_LIMIT, releaseAIConcurrency } from '@/lib/ai/runtime'
import { cleanWebSearchQuery, planAIRequest } from '@/lib/ai/planner'
import { presentAIResponse } from '@/lib/ai/presentation'
import { AI_ENTITY_KINDS, type AIClientContext, type AIRole, type AIToolCard } from '@/lib/ai/types'

export const maxDuration = 60
type GuestHistory = Array<{ role?: unknown; content?: unknown }>

export async function POST(request: Request) {
  let lease = ''
  let streamOwnsLease = false
  try {
    const body = await request.json() as { message?: unknown; conversationId?: unknown; history?: unknown; clientContext?: unknown }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > AI_MESSAGE_LIMIT) return NextResponse.json({ error: 'اكتب رسالة صحيحة بحد أقصى 4000 حرف' }, { status: 400 })

    const user = await getSession()
    const role: AIRole = user?.role || 'GUEST'
    const plan = planAIRequest(message, role)
    const address = requestAddress(request)
    const quotaKeys = user ? [`ai-hour:user:${role}:${user.id}`, `ai-hour:ip:${role}:${address}`] : [`ai-hour:guest:${address}`]
    const limits = await Promise.all(quotaKeys.map((key) => rateLimit(key, aiQuota(role), 60 * 60 * 1000)))
    const denied = limits.find((limit) => !limit.allowed)
    if (denied) return NextResponse.json({ error: 'وصلت للحد المؤقت لاستخدام المساعد. حاول بعد قليل.' }, { status: 429, headers: { 'Retry-After': String(denied.retryAfter) } })
    lease = await acquireAIConcurrency(`ai:${user?.id || address}`, role) || ''
    if (!lease) return NextResponse.json({ error: 'لديك طلب آخر قيد التنفيذ. انتظر لحظة وحاول مجدداً.' }, { status: 429, headers: { 'Retry-After': '5' } })

    void purgeExpiredAIData().catch((error) => console.error('AI cleanup error:', error))
    const liveSearchCard = plan.liveSearch ? await searchInternet(cleanWebSearchQuery(message)) : undefined
    const modelMessage = liveSearchCard ? `${message}\n\n${liveSearchContext(liveSearchCard)}` : message
    let conversationId: string | undefined
    let expiresAt: string | undefined
    let modelMessages: ModelMessage[]

    if (user) {
      const conversation = await getOrCreateConversation({ conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined, user, firstMessage: message })
      conversationId = conversation.id
      expiresAt = conversation.expiresAt.toISOString()
      const previous = await loadConversationMessages(conversation.id, user)
      modelMessages = [...previous.slice(-12).map((item) => ({ role: item.role === 'assistant' ? 'assistant' as const : 'user' as const, content: item.content })), { role: 'user', content: modelMessage }]
      await appendAIMessage({ conversationId: conversation.id, role: 'user', content: message })
    } else modelMessages = [...safeGuestHistory(body.history), { role: 'user', content: modelMessage }]

    const agent = createGhyarAgent({ role, user, conversationId, clientContext: safeClientContext(body.clientContext), plan, liveSearchProvided: Boolean(liveSearchCard) })
    const token = lease
    streamOwnsLease = true
    const encoder = new TextEncoder()
    const startedAt = Date.now()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        let answer = ''
        let cards: AIToolCard[] = liveSearchCard ? [liveSearchCard] : []
        try {
          send({ type: 'status', status: plan.complexity === 'heavy' ? 'جاري تحليل الطلب بعناية...' : plan.liveSearch ? 'جاري التحقق من أحدث النتائج...' : 'جاري تنفيذ طلبك...' })
          const result = await agent.stream({ messages: modelMessages, timeout: { totalMs: plan.timeoutMs } })
          for await (const delta of result.textStream) { answer += delta; send({ type: 'text-delta', delta }) }
          const steps = await result.steps
          cards = dedupeCards([...cards, ...steps.flatMap((step) => step.toolResults.map((toolResult) => toolResult.output)).filter(isToolCard)])
          const fallback = cards.length ? '' : 'تعذر إنشاء إجابة كاملة حالياً. حاول مرة أخرى بعد قليل.'
          const presented = presentAIResponse(answer.trim() || fallback, cards)
          answer = appendWebSources(presented.answer, await result.sources)
          cards = presented.cards
          if (user && conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { cards } })
          send({ type: 'done', conversationId, answer, cards, expiresAt })
          console.info('AI request completed:', { role, intent: plan.intent, complexity: plan.complexity, tools: plan.tools, durationMs: Date.now() - startedAt, cards: cards.length })
        } catch (error) {
          console.error('AI stream failed:', { role, intent: plan.intent, complexity: plan.complexity, durationMs: Date.now() - startedAt, message: error instanceof Error ? error.message : 'UnknownError' })
          if (cards.length) {
            const presented = presentAIResponse(answer.trim(), cards)
            send({ type: 'done', conversationId, answer: presented.answer, cards: presented.cards, expiresAt, partial: true })
          }
          else send({ type: 'error', error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.' })
        } finally {
          await releaseAIConcurrency(token).catch((error) => console.error('AI concurrency release error:', error))
          controller.close()
        }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('AI request failed:', { message, name: error instanceof Error ? error.name : 'UnknownError' })
    if (message === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ error: 'انتهت المحادثة. ابدأ محادثة جديدة.' }, { status: 410 })
    if (['ACTION_FORBIDDEN', 'NAVIGATION_FORBIDDEN', 'DRAFT_FORBIDDEN'].includes(message)) return NextResponse.json({ error: 'هذا الطلب غير متاح لصلاحية حسابك.' }, { status: 403 })
    if (['INVALID_ACTION_INPUT', 'PART_NOT_OWNED'].includes(message)) return NextResponse.json({ error: 'تعذر تجهيز الإجراء لأن البيانات غير صالحة أو لم تعد متاحة.' }, { status: 400 })
    return NextResponse.json({ error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.' }, { status: 503 })
  } finally {
    if (lease && !streamOwnsLease) await releaseAIConcurrency(lease).catch((error) => console.error('AI concurrency release error:', error))
  }
}

function appendWebSources(answer: string, sources: Array<{ sourceType: string; url?: string; title?: string }>) {
  const unique = [...new Map(sources.filter((source): source is { sourceType: string; url: string; title?: string } => source.sourceType === 'url' && typeof source.url === 'string' && /^https?:\/\//i.test(source.url)).map((source) => [source.url, source])).values()].slice(0, 5)
  if (!unique.length) return answer
  return `${answer}\n\nالمصادر:\n\n${unique.map((source, index) => `- [${(source.title?.trim() || `مصدر ${index + 1}`).replace(/[\[\]]/g, '').slice(0, 120)}](${source.url})`).join('\n')}`
}

function liveSearchContext(card: AIToolCard) {
  const results = card.items?.map((item) => `- ${item.title}: ${item.subtitle || ''} ${item.href || ''}`).join('\n') || ''
  return `نتائج ويب حديثة. استخدم فقط ما تؤيده النتائج وقل بوضوح إن كان السعر تقديرياً:\n${card.description || ''}\n${results}`
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
    const quantity = Number(item.quantity); const price = Number(item.price)
    if (!partId || !name || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return []
    return [{ partId, name, quantity: Math.min(quantity, 1000), price: Math.min(price, 100000000) }]
  }), ...(kind && id && label ? { selection: { kind, id, label } } : {}) }
}

function safeGuestHistory(value: unknown): ModelMessage[] {
  if (!Array.isArray(value)) return []
  return (value as GuestHistory).slice(-10).flatMap((item) => {
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, AI_MESSAGE_LIMIT) : ''
    if (!content || !['user', 'assistant'].includes(String(item.role))) return []
    return [{ role: item.role === 'assistant' ? 'assistant' as const : 'user' as const, content }]
  })
}

function dedupeCards(cards: AIToolCard[]) { return cards.filter((card, index, all) => all.findIndex((candidate) => candidate.type === card.type && candidate.title === card.title) === index) }
function isToolCard(value: unknown): value is AIToolCard { return Boolean(value && typeof value === 'object' && ['results', 'insight', 'navigation', 'draft', 'proposal'].includes(String((value as { type?: unknown }).type))) }
