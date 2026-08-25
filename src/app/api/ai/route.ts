import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse, readUIMessageStream, type UIMessageChunk } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIConcurrency, aiModel, aiProviderTargets, aiQuota, releaseAIConcurrency, type AIProviderTarget } from '@/lib/ai/runtime'
import { planAIRequest } from '@/lib/ai/planner'
import { compactConversationContext, materializePrivateImages, sanitizeIncomingUserMessage, storedMessageToUIMessage, textFromMessage, type GhyarAIMessage } from '@/lib/ai/messages'
import { AI_ENTITY_KINDS, type AIClientContext, type AIRole } from '@/lib/ai/types'
import { executeDirectAITool } from '@/lib/ai/tools'

export const maxDuration = 120

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
    const directCard = await executeDirectAITool({ toolName: plan.forcedTool, role, user, conversationId, clientContext, message })
    if (directCard) {
      const card = directCard
      const answer = cardToDirectAnswer(card)
      if (conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { parts: [{ type: 'text', text: answer }] } })
      console.info(JSON.stringify({ event: 'ai.direct_tool.completed', requestId, role, intent: plan.intent, tool: plan.forcedTool, durationMs: Date.now() - startedAt }))
      const stream = createUIMessageStream<GhyarAIMessage>({
        execute: ({ writer }) => {
          writer.write({ type: 'start', messageMetadata: { conversationId, expiresAt, requestId } })
          writer.write({ type: 'text-start', id: requestId })
          writer.write({ type: 'text-delta', id: requestId, delta: answer })
          writer.write({ type: 'text-end', id: requestId })
        },
      })
      return createUIMessageStreamResponse({ stream })
    }
    const modelMessages = await materializePrivateImages(compactConversationContext(uiMessages), user)
    const hasImage = current.parts.some((part) => part.type === 'file')
    const attempts: AIProviderAttempt[] = []
    for (const [index, provider] of aiProviderTargets().entries()) {
      const attemptStarted = Date.now(); let stepCount = 0; let clientStream: ReadableStream<UIMessageChunk> | undefined
      try {
        console.info(JSON.stringify({ event: 'ai.provider.started', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, attempt: index + 1, images: hasImage ? 1 : 0 }))
        const agent = createGhyarAgent({ role, user, conversationId, clientContext, plan, provider })
        const source = await createAgentUIStream({
          agent, uiMessages: modelMessages, timeout: { totalMs: attemptTimeout(plan.complexity, hasImage) }, sendReasoning: false, sendSources: true,
          messageMetadata: () => ({ conversationId, expiresAt, requestId, provider, fallbackCount: index }),
          onStepEnd: () => { stepCount += 1 },
          onError: (error) => errorMessage(error),
        })
        const branches = source.tee(); const probe = branches[0]; clientStream = branches[1]
        let responseMessage: GhyarAIMessage | undefined
        for await (const snapshot of readUIMessageStream<GhyarAIMessage>({ stream: probe, terminateOnError: true })) responseMessage = snapshot
        if (!responseMessage || !hasUsefulAIOutput(responseMessage)) throw new Error('EMPTY_AI_RESPONSE')
        const answer = textFromMessage(responseMessage)
        if (conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: answer, metadata: { parts: responseMessage.parts } })
        attempts.push({ provider, model: providerModelName(provider), status: 'success', durationMs: Date.now() - attemptStarted, stepCount })
        console.info(JSON.stringify({ event: 'ai.request.completed', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, fallbackCount: index, stepCount, durationMs: Date.now() - startedAt, answerChars: answer.length }))
        return createUIMessageStreamResponse({ stream: clientStream })
      } catch (error) {
        await clientStream?.cancel().catch(() => undefined)
        attempts.push({ provider, model: providerModelName(provider), status: 'failed', durationMs: Date.now() - attemptStarted, stepCount, error: safeErrorCategory(error) })
        console.warn(JSON.stringify({ event: 'ai.provider.failed', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, attempt: index + 1, stepCount, durationMs: Date.now() - attemptStarted, error: safeErrorCategory(error) }))
      }
    }
    const fallback = terminalFallback(message, hasImage, requestId)
    if (conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: fallback, metadata: { parts: [{ type: 'text', text: fallback }] } })
    console.error(JSON.stringify({ event: 'ai.all_providers_failed', requestId, role, intent: plan.intent, complexity: plan.complexity, durationMs: Date.now() - startedAt, attempts }))
    return textUIResponse(fallback, { conversationId, expiresAt, requestId, provider: 'deterministic', fallbackCount: attempts.length })
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
type AIProviderAttempt = { provider: AIProviderTarget; model: string; status: 'success' | 'failed'; durationMs: number; stepCount: number; error?: string }
function providerModelName(provider: AIProviderTarget) { return provider === 'openrouter' ? 'openrouter/free' : provider === 'gateway' ? `google/${aiModel()}` : aiModel() }
function attemptTimeout(complexity: 'quick' | 'standard' | 'heavy', hasImage: boolean) { return hasImage || complexity === 'heavy' ? 20_000 : complexity === 'standard' ? 15_000 : 10_000 }
function hasUsefulAIOutput(message: GhyarAIMessage) {
  // A tool result alone is not a user-visible answer in every client renderer.
  // Require final visible text so a tool-only completion fails over instead of
  // leaving an empty assistant bubble that appears to load forever.
  return message.parts.some((part) => part.type === 'text' && Boolean(part.text.trim()))
}
function safeErrorCategory(error: unknown) {
  const message = errorMessage(error)
  if (/402|payment|required|credit/i.test(message)) return 'credits_exhausted'
  if (/429|rate.?limit|resource.?exhausted/i.test(message)) return 'rate_limited'
  if (/timeout|timed out|abort/i.test(message)) return 'timeout'
  if (/empty_ai_response/i.test(message)) return 'empty'
  if (/tool|schema|json/i.test(message)) return 'invalid_tool_output'
  if (/5\d\d|unavailable|high demand/i.test(message)) return 'provider_unavailable'
  return 'provider_error'
}
function terminalFallback(message: string, hasImage: boolean, requestId: string) {
  const english = /[A-Za-z]/.test(message) && !/[\u0600-\u06FF]/.test(message)
  if (english) return hasImage ? `I couldn't safely analyze this image because all free AI services are busy right now. Your image was not guessed or misidentified. Please retry shortly. Request: ${requestId}` : `All free AI services are busy right now. Your request was kept intact; please retry shortly. Request: ${requestId}`
  return hasImage ? `تعذر تحليل الصورة بأمان لأن كل خدمات الذكاء الاصطناعي المجانية مشغولة حالياً. لم أخمّن محتوى الصورة أو أحددها بشكل خاطئ. أعد المحاولة بعد قليل. رقم الطلب: ${requestId}` : `كل خدمات الذكاء الاصطناعي المجانية مشغولة حالياً. احتفظنا بطلبك دون اختلاق إجابة؛ أعد المحاولة بعد قليل. رقم الطلب: ${requestId}`
}
function textUIResponse(text: string, metadata: GhyarAIMessage['metadata']) {
  const id = randomUUID()
  const stream = createUIMessageStream<GhyarAIMessage>({ execute: ({ writer }) => { writer.write({ type: 'start', messageMetadata: metadata }); writer.write({ type: 'text-start', id }); writer.write({ type: 'text-delta', id, delta: text }); writer.write({ type: 'text-end', id }) } })
  return createUIMessageStreamResponse({ stream })
}
function cardToDirectAnswer(card: { title: string; description?: string; items?: Array<{ title: string; subtitle?: string; value?: string | number }> }) {
  const items = card.items?.map((item) => `• ${item.title}${item.subtitle ? ` — ${item.subtitle}` : ''}${item.value !== undefined ? ` — ${item.value}` : ''}`).join('\n')
  return [card.title, card.description, items].filter(Boolean).join('\n')
}
function friendlyAIError(error: unknown, requestId: string) {
  const message = errorMessage(error)
  if (/429|rate.?limit|resource.?exhausted/i.test(message)) return `وصل Gemini إلى حد الاستخدام المجاني للمشروع حالياً. حاول بعد قليل. رقم الطلب: ${requestId}`
  if (/timeout|timed out|abort/i.test(message)) return `استغرق Gemini وقتاً أطول من الحد المتاح. اختصر الطلب أو حاول مرة أخرى. رقم الطلب: ${requestId}`
  if (message === 'AI_UNAVAILABLE') return `مفتاح Gemini غير مضاف إلى الخادم بعد. رقم الطلب: ${requestId}`
  return `تعذر على Gemini إكمال الطلب حالياً، ولم يتم استخدام موديل بديل. رقم الطلب: ${requestId}`
}
