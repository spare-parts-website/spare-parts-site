import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createAgentUIStreamResponse } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIConcurrency, aiModel, aiQuota, releaseAIConcurrency } from '@/lib/ai/runtime'
import { planAIRequest } from '@/lib/ai/planner'
import { compactConversationContext, materializePrivateImages, sanitizeIncomingUserMessage, storedMessageToUIMessage, textFromMessage, type GhyarAIMessage } from '@/lib/ai/messages'
import { AI_ENTITY_KINDS, type AIClientContext, type AIRole } from '@/lib/ai/types'

export const maxDuration = 60

export async function POST(request: Request) {
  const requestId = randomUUID(); const startedAt = Date.now(); let lease = ''; let streamOwnsLease = false
  try {
    const body = await request.json() as { messages?: unknown; conversationId?: unknown; clientContext?: unknown }
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 32) return NextResponse.json({ error: 'بيانات المحادثة غير صحيحة', requestId }, { status: 400 })
    const user = await getSession(); const role: AIRole = user?.role || 'GUEST'
    const current = sanitizeIncomingUserMessage(body.messages.at(-1), user)
    const message = textFromMessage(current) || 'حلل الصورة المرفقة وساعدني بناءً على ما يظهر فيها.'
    const plan = planAIRequest(message, role); const address = requestAddress(request)
    const quotaKeys = user ? [`ai-hour:user:${role}:${user.id}`, `ai-hour:ip:${role}:${address}`] : [`ai-hour:guest:${address}`]
    const limits = await Promise.all(quotaKeys.map((key) => rateLimit(key, aiQuota(role), 60 * 60 * 1000))); const denied = limits.find((limit) => !limit.allowed)
    if (denied) return NextResponse.json({ error: 'وصلت للحد المؤقت لاستخدام المساعد. حاول بعد قليل.', requestId }, { status: 429, headers: { 'Retry-After': String(denied.retryAfter) } })
    lease = await acquireAIConcurrency(`ai:${user?.id || address}`, role) || ''
    if (!lease) return NextResponse.json({ error: 'لديك طلب آخر قيد التنفيذ. انتظر لحظة وحاول مجدداً.', requestId }, { status: 429, headers: { 'Retry-After': '5' } })
    void purgeExpiredAIData().catch((error) => console.error(JSON.stringify({ event: 'ai.cleanup.failed', requestId, error: errorMessage(error) })))

    let conversationId: string | undefined; let expiresAt: string | undefined; let uiMessages: GhyarAIMessage[]
    if (user) {
      const conversation = await getOrCreateConversation({ conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined, user, firstMessage: message })
      conversationId = conversation.id; expiresAt = conversation.expiresAt.toISOString()
      const previous = (await loadConversationMessages(conversation.id, user)).map(storedMessageToUIMessage)
      uiMessages = [...previous.slice(-30), current]
      await appendAIMessage({ conversationId, role: 'user', content: message, metadata: { parts: current.parts } })
    } else uiMessages = [...safeGuestHistory(body.messages.slice(0, -1)), current]

    const clientContext = safeClientContext(body.clientContext)
    const agent = createGhyarAgent({ role, user, conversationId, clientContext, plan })
    const modelMessages = await materializePrivateImages(compactConversationContext(uiMessages), user)
    const token = lease; let released = false; let stepCount = 0
    const release = async () => { if (!released) { released = true; await releaseAIConcurrency(token) } }
    streamOwnsLease = true
    console.info(JSON.stringify({ event: 'ai.request.started', requestId, model: aiModel(), role, intent: plan.intent, complexity: plan.complexity, images: current.parts.filter((part) => part.type === 'file').length }))
    return await createAgentUIStreamResponse({
      agent, uiMessages: modelMessages, timeout: { totalMs: plan.timeoutMs }, sendReasoning: false, sendSources: true,
      messageMetadata: () => ({ conversationId, expiresAt, requestId }),
      onStepEnd: () => { stepCount += 1 },
      onEnd: async ({ responseMessage, finishReason, isAborted }) => {
        try {
          const answer = textFromMessage(responseMessage)
          if (!isAborted && conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { parts: responseMessage.parts } })
          console.info(JSON.stringify({ event: 'ai.request.completed', requestId, model: aiModel(), role, intent: plan.intent, complexity: plan.complexity, finishReason, aborted: isAborted, stepCount, durationMs: Date.now() - startedAt, answerChars: answer.length }))
        } finally { await release() }
      },
      onError: (error) => {
        console.error(JSON.stringify({ event: 'ai.provider.failed', requestId, model: aiModel(), role, intent: plan.intent, complexity: plan.complexity, stepCount, durationMs: Date.now() - startedAt, error: errorMessage(error) }))
        void release().catch(() => undefined)
        return friendlyAIError(error, requestId)
      },
    })
  } catch (error) {
    const message = errorMessage(error); console.error(JSON.stringify({ event: 'ai.request.failed', requestId, durationMs: Date.now() - startedAt, error: message }))
    if (message === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ error: 'انتهت المحادثة. ابدأ محادثة جديدة.', requestId }, { status: 410 })
    if (message === 'INVALID_AI_MESSAGE') return NextResponse.json({ error: 'الرسالة أو الصورة غير صالحة.', requestId }, { status: 400 })
    if (message === 'AI_IMAGE_UNAVAILABLE') return NextResponse.json({ error: 'تعذر قراءة الصورة بأمان. أعد رفعها وحاول مرة أخرى.', requestId }, { status: 400 })
    if (['ACTION_FORBIDDEN', 'NAVIGATION_FORBIDDEN', 'DRAFT_FORBIDDEN'].includes(message)) return NextResponse.json({ error: 'هذا الطلب غير متاح لصلاحية حسابك.', requestId }, { status: 403 })
    return NextResponse.json({ error: friendlyAIError(error, requestId), requestId }, { status: 503 })
  } finally { if (lease && !streamOwnsLease) await releaseAIConcurrency(lease).catch(() => undefined) }
}

function safeGuestHistory(values: unknown[]): GhyarAIMessage[] {
  return values.slice(-10).flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const raw = value as { role?: unknown; parts?: unknown }; if (!['user', 'assistant'].includes(String(raw.role)) || !Array.isArray(raw.parts)) return []
    const text = raw.parts.flatMap((part) => part && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string' ? [(part as { text: string }).text.trim().slice(0, 4000)] : []).join('\n')
    return text ? [{ id: `guest-${index}`, role: raw.role as 'user' | 'assistant', parts: [{ type: 'text' as const, text }] }] : []
  })
}

function safeClientContext(value: unknown): AIClientContext {
  const cart = value && typeof value === 'object' && Array.isArray((value as { cart?: unknown }).cart) ? (value as { cart: unknown[] }).cart : []
  const rawSelection = value && typeof value === 'object' ? (value as { selection?: unknown }).selection : undefined
  const selection = rawSelection && typeof rawSelection === 'object' ? rawSelection as Record<string, unknown> : null
  const kind = selection && AI_ENTITY_KINDS.includes(selection.kind as (typeof AI_ENTITY_KINDS)[number]) ? selection.kind as (typeof AI_ENTITY_KINDS)[number] : undefined
  const id = typeof selection?.id === 'string' ? selection.id.slice(0, 100) : ''; const label = typeof selection?.label === 'string' ? selection.label.trim().slice(0, 160) : ''
  return { cart: cart.slice(0, 20).flatMap((raw) => { if (!raw || typeof raw !== 'object') return []; const item = raw as Record<string, unknown>; const partId = typeof item.partId === 'string' ? item.partId.slice(0, 100) : ''; const name = typeof item.name === 'string' ? item.name.trim().slice(0, 160) : ''; const quantity = Number(item.quantity); const price = Number(item.price); return partId && name && Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0 ? [{ partId, name, quantity: Math.min(quantity, 1000), price: Math.min(price, 100000000) }] : [] }), ...(kind && id && label ? { selection: { kind, id, label } } : {}) }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || 'UnknownError') }
function friendlyAIError(error: unknown, requestId: string) {
  const message = errorMessage(error)
  if (/429|rate.?limit/i.test(message)) return `موديل Gemma المجاني وصل لحد الاستخدام لدى المزود حالياً. حاول بعد قليل. رقم الطلب: ${requestId}`
  if (/timeout|timed out|abort/i.test(message)) return `استغرق Gemma وقتاً أطول من الحد المتاح. اختصر الطلب أو حاول مرة أخرى. رقم الطلب: ${requestId}`
  return `تعذر على Gemma إكمال الطلب حالياً، ولم يتم استخدام موديل بديل. رقم الطلب: ${requestId}`
}
