import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse, readUIMessageStream } from 'ai'
import { getSession } from '@/lib/auth'
import { rateLimit, requestAddress } from '@/lib/rate-limit'
import { createGhyarAgent } from '@/lib/ai/agent'
import { appendAIMessage, getOrCreateConversation, loadConversationMessages, purgeExpiredAIData } from '@/lib/ai/history'
import { acquireAIDedupLease, acquireAIConcurrency, aiModel, aiProviderTargets, aiQuota, aiRequestFingerprint, releaseAIConcurrency, type AIProviderTarget } from '@/lib/ai/runtime'
import { planAIRequest } from '@/lib/ai/planner'
import { compactConversationContext, materializePrivateImages, sanitizeIncomingUserMessage, storedMessageToUIMessage, textFromMessage, type GhyarAIMessage } from '@/lib/ai/messages'
import { AI_ENTITY_KINDS, type AIClientContext, type AIRole, type AIToolCard, type AISelectedEntity } from '@/lib/ai/types'
import { buildSellerMessagePlan, buildSellerPerformancePlan, executeDeterministicAIRequest } from '@/lib/ai/tools'
import { buildAIConversationContext, resolveContextSelection, safePageContext } from '@/lib/ai/context'
import { guardAIResponse } from '@/lib/ai/response-guard'
import { isProviderCircuitOpen, providerBackoffMs, providerHealthSnapshot, recordProviderFailure, recordProviderSuccess } from '@/lib/ai/provider-health'
import { notifyOperationalAlert } from '@/lib/operational-alerts'

export const maxDuration = 120

export async function POST(request: Request) {
  const requestId = randomUUID(); const startedAt = Date.now(); let lease = ''; let streamOwnsLease = false
  try {
    const body = await request.json() as { messages?: unknown; conversationId?: unknown; clientContext?: unknown; clientRequestId?: unknown }
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 32) return NextResponse.json({ error: 'بيانات المحادثة غير صحيحة', requestId }, { status: 400 })
    const user = await getSession(); const role: AIRole = user?.role || 'GUEST'
    const current = sanitizeIncomingUserMessage(body.messages.at(-1), user)
    const message: string = textFromMessage(current) || 'حلل الصورة المرفقة وساعدني بناءً على ما يظهر فيها.'
    const address = requestAddress(request)
    void purgeExpiredAIData().catch((error) => console.error(JSON.stringify({ event: 'ai.cleanup.failed', requestId, error: errorMessage(error) })))

    const clientContext = safeClientContext(body.clientContext)
    const clientRequestId = safeClientRequestId(body.clientRequestId)
    const fingerprint = aiRequestFingerprint({
      identity: user?.id || address,
      clientRequestId,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
      message,
      parts: current.parts.map((part) => part.type === 'file' ? { type: 'file', mediaType: part.mediaType, filename: part.filename, urlLength: part.url.length, urlPrefix: part.url.slice(0, 48), urlSuffix: part.url.slice(-48) } : part),
      selection: clientContext.selection,
    })
    const dedupe = await acquireAIDedupLease(`ai-dedupe:${user?.id || address}:${fingerprint}`)
    if (dedupe.duplicate) return duplicateAIResponse(requestId)

    let conversationId: string | undefined; let expiresAt: string | undefined; let uiMessages: GhyarAIMessage[]
    if (user) {
      const conversation = await getOrCreateConversation({ conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined, user, firstMessage: message })
      conversationId = conversation.id; expiresAt = conversation.expiresAt.toISOString()
      const previous = (await loadConversationMessages(conversation.id, user)).map(storedMessageToUIMessage)
      uiMessages = [...previous.slice(-30), current]
      await appendAIMessage({ conversationId, role: 'user', content: message, metadata: { parts: current.parts } })
    } else uiMessages = [...safeGuestHistory(body.messages.slice(0, -1)), current]

    // Resolve bounded conversation/page/entity context before selecting the
    // intent. Follow-ups can therefore reuse a prior result safely.
    const conversationContext = buildAIConversationContext({ messages: uiMessages, currentMessage: message, role, clientContext })
    const contextualSelection = clientContext.selection || resolveContextSelection(conversationContext, message)
    const planningContext = {
      ...clientContext,
      ...(conversationContext.previousSearch ? { previousSearch: conversationContext.previousSearch } : {}),
      ...(conversationContext.previousEntities?.length ? { previousEntities: conversationContext.previousEntities } : {}),
      ...(contextualSelection ? { selection: contextualSelection } : {}),
    }
    const plan = planAIRequest(message, role, conversationContext)
    if (role === 'SHOP_OWNER' && plan.intent === 'seller_message_workflow' && user && conversationId) {
      const result = await buildSellerMessagePlan({ user, conversationId, selection: planningContext.selection })
      const guarded = guardAIResponse({ role, intent: plan.intent, answer: result.answer, cards: result.cards })
      const safeResult = { answer: guarded.answer, cards: guarded.cards, sources: guarded.sources }
      await appendDirectResult({ result: safeResult, conversationId, expiresAt, requestId, event: 'ai.seller_message_plan.completed', startedAt })
      return directResultResponse(safeResult, { conversationId, expiresAt, requestId, provider: 'deterministic' })
    }
    const comprehensiveSellerRequest = role === 'SHOP_OWNER' && plan.intent === 'seller_insights' && /(?:اقترح|سعر|خصم|عرض|suggest|price|discount|offer)/i.test(message)
    if (comprehensiveSellerRequest && user && conversationId) {
      const result = await buildSellerPerformancePlan({ user, conversationId })
      const guarded = guardAIResponse({ role, intent: plan.intent, answer: result.answer, cards: result.cards })
      const safeResult = { answer: guarded.answer, cards: guarded.cards, sources: guarded.sources }
      await appendDirectResult({ result: safeResult, conversationId, expiresAt, requestId, event: 'ai.seller_plan.completed', startedAt })
      return directResultResponse(safeResult, { conversationId, expiresAt, requestId, provider: 'deterministic' })
    }
    try {
      const directResult = await executeDeterministicAIRequest({ toolName: plan.forcedTool, role, user, conversationId, clientContext: planningContext, message })
      if (directResult) {
        const guarded = guardAIResponse({ role, intent: plan.intent, answer: directResult.answer, cards: directResult.cards })
        const safeResult = { answer: guarded.answer, cards: guarded.cards, sources: guarded.sources }
        if (conversationId) await appendDirectResult({ result: safeResult, conversationId, expiresAt, requestId, event: 'ai.deterministic.completed', startedAt })
        else console.info(JSON.stringify({ event: 'ai.deterministic.completed', requestId, role, intent: plan.intent, tool: plan.forcedTool || 'static', cards: safeResult.cards.length, durationMs: Date.now() - startedAt }))
        return directResultResponse(safeResult, { conversationId, expiresAt, requestId, provider: 'deterministic' })
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: 'ai.deterministic.failed', requestId, role, intent: plan.intent, tool: plan.forcedTool, error: safeErrorCategory(error) }))
    }

    // Only requests that genuinely need a language/vision model consume the AI
    // quota or a concurrency slot. Database, search, navigation and protected
    // proposal commands return above without touching provider limits.
    const quotaKeys = user ? [`ai-hour:user:${role}:${user.id}`, `ai-hour:ip:${role}:${address}`] : [`ai-hour:guest:${address}`]
    const limits = await Promise.all(quotaKeys.map((key) => rateLimit(key, aiQuota(role), 60 * 60 * 1000))); const denied = limits.find((limit) => !limit.allowed)
    if (denied) return NextResponse.json({ error: 'وصلت للحد المؤقت لاستخدام المساعد. حاول بعد قليل.', requestId }, { status: 429, headers: { 'Retry-After': String(denied.retryAfter) } })
    lease = await acquireAIConcurrency(`ai:${user?.id || address}`, role) || ''
    if (!lease) return NextResponse.json({ error: 'لديك طلب آخر قيد التنفيذ. انتظر لحظة وحاول مجدداً.', requestId }, { status: 429, headers: { 'Retry-After': '5' } })
    const modelMessages = await materializePrivateImages(compactConversationContext(uiMessages), user)
    const hasImage = current.parts.some((part) => part.type === 'file')
    const attempts: AIProviderAttempt[] = []
    for (const [index, provider] of aiProviderTargets({ hasImage }).entries()) {
      if (isProviderCircuitOpen(provider)) {
        attempts.push({ provider, model: providerModelName(provider), status: 'skipped', durationMs: 0, stepCount: 0, error: 'circuit_open' })
        console.warn(JSON.stringify({ event: 'ai.provider.circuit_open', requestId, provider, model: providerModelName(provider), role, intent: plan.intent }))
        continue
      }
      const backoff = providerBackoffMs(index)
      if (backoff) await new Promise((resolve) => setTimeout(resolve, backoff))
      const attemptStarted = Date.now(); let stepCount = 0
      try {
        console.info(JSON.stringify({ event: 'ai.provider.started', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, attempt: index + 1, images: hasImage ? 1 : 0 }))
        const agent = createGhyarAgent({ role, user, conversationId, clientContext: planningContext, conversationContext, plan, provider })
        const source = await createAgentUIStream({
          agent, uiMessages: modelMessages, timeout: { totalMs: attemptTimeout(plan.complexity, hasImage, provider) }, sendReasoning: false, sendSources: true,
          messageMetadata: () => ({ conversationId, expiresAt, requestId, provider, fallbackCount: index }),
          onStepEnd: () => { stepCount += 1 },
          onError: (error) => errorMessage(error),
        })
        let responseMessage: GhyarAIMessage | undefined
        for await (const snapshot of readUIMessageStream<GhyarAIMessage>({ stream: source, terminateOnError: true })) responseMessage = snapshot
        if (!responseMessage) throw new Error('EMPTY_AI_RESPONSE')
        const guarded = guardAIResponse({ role, intent: plan.intent, parts: responseMessage.parts })
        if (!hasUsefulAIOutput(responseMessage) && !guarded.cards.length) throw new Error('EMPTY_AI_RESPONSE')
        const safeResult = { answer: guarded.answer, cards: guarded.cards, sources: guarded.sources }
        if (conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: safeResult.answer, metadata: { parts: responseParts(safeResult, requestId) } })
        recordProviderSuccess(provider)
        attempts.push({ provider, model: providerModelName(provider), status: 'success', durationMs: Date.now() - attemptStarted, stepCount })
        console.info(JSON.stringify({ event: 'ai.request.completed', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, fallbackCount: index, stepCount, durationMs: Date.now() - startedAt, answerChars: safeResult.answer.length, cards: safeResult.cards.length, guard: guarded.rejected ? guarded.reasons : 'accepted' }))
        return directResultResponse(safeResult, { conversationId, expiresAt, requestId, provider, fallbackCount: index })
      } catch (error) {
        const errorCategory = safeErrorCategory(error)
        const health = recordProviderFailure(provider, errorCategory)
        attempts.push({ provider, model: providerModelName(provider), status: 'failed', durationMs: Date.now() - attemptStarted, stepCount, error: errorCategory })
        console.warn(JSON.stringify({ event: 'ai.provider.failed', requestId, provider, model: providerModelName(provider), role, intent: plan.intent, complexity: plan.complexity, attempt: index + 1, stepCount, durationMs: Date.now() - attemptStarted, error: safeErrorCategory(error) }))
        if (health.circuitOpened) console.warn(JSON.stringify({ event: 'ai.provider.circuit_tripped', requestId, provider, failures: health.consecutiveFailures, openedUntil: new Date(health.openedUntil).toISOString() }))
      }
    }
    const fallback = terminalFallback(message, hasImage, requestId)
    if (conversationId) await appendAIMessage({ conversationId, role: 'assistant', content: fallback, metadata: { parts: [{ type: 'text', text: fallback }] } })
    console.error(JSON.stringify({ event: 'ai.all_providers_failed', requestId, role, intent: plan.intent, complexity: plan.complexity, durationMs: Date.now() - startedAt, attempts, providerHealth: providerHealthSnapshot() }))
    void notifyOperationalAlert('ai.all_providers_failed', { requestId, role, intent: plan.intent, attempts: attempts.length })
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
    const parts = raw.parts.flatMap((part, partIndex) => {
      if (!part || typeof part !== 'object') return []
      const candidate = part as { type?: unknown; text?: unknown; state?: unknown; output?: unknown }
      if (candidate.type === 'text' && typeof candidate.text === 'string') {
        const text = candidate.text.trim().slice(0, 4000)
        return text ? [{ type: 'text' as const, text }] : []
      }
      // Preserve only the bounded public result-card shape so a guest can say
      // “the second one” on the next turn. Proposals, client actions, files,
      // private links, and arbitrary tool inputs are intentionally discarded.
      if (raw.role !== 'assistant' || candidate.type !== 'dynamic-tool' || candidate.state !== 'output-available') return []
      const card = safeGuestCard(candidate.output)
      return card ? [{ type: 'dynamic-tool', toolName: 'guest-context', toolCallId: `guest-${index}-${partIndex}`, state: 'output-available', input: {}, output: card, dynamic: true } as GhyarAIMessage['parts'][number]] : []
    })
    return parts.length ? [{ id: `guest-${index}`, role: raw.role as 'user' | 'assistant', parts: parts as GhyarAIMessage['parts'] }] : []
  })
}

function safeGuestCard(value: unknown): AIToolCard | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const type = raw.type === 'results' || raw.type === 'insight' || raw.type === 'navigation' ? raw.type : 'results'
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 160) : ''
  if (!title) return undefined
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 800) : undefined
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === 'string' ? candidate.id.slice(0, 100) : ''
    const itemTitle = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 160) : ''
    if (!id || !itemTitle) return []
    const href = typeof candidate.href === 'string' && /^\/(?:parts|stores)(?:\/|$)/i.test(candidate.href) ? candidate.href.slice(0, 240) : undefined
    const selectRaw = candidate.select
    const select = selectRaw && typeof selectRaw === 'object' ? selectRaw as Record<string, unknown> : undefined
    const selectKind: AISelectedEntity['kind'] | undefined = select && (select.kind === 'part' || select.kind === 'store') ? select.kind : undefined
    const selectId = select && typeof select.id === 'string' ? select.id.slice(0, 100) : ''
    const selectLabel = select && typeof select.label === 'string' ? select.label.trim().slice(0, 160) : ''
    const selection: AISelectedEntity | undefined = selectKind && selectId && selectLabel ? { kind: selectKind, id: selectId, label: selectLabel } : undefined
    const itemValue = typeof candidate.value === 'string' || typeof candidate.value === 'number' ? candidate.value : undefined
    return [{ id, title: itemTitle, ...(typeof candidate.subtitle === 'string' ? { subtitle: candidate.subtitle.trim().slice(0, 240) } : {}), ...(href ? { href } : {}), ...(itemValue !== undefined ? { value: itemValue } : {}), ...(selection ? { select: selection } : {}) }]
  }) : []
  return { type, title, ...(description ? { description } : {}), ...(items.length ? { items } : {}) }
}

function safeClientContext(value: unknown): AIClientContext {
  const cart = value && typeof value === 'object' && Array.isArray((value as { cart?: unknown }).cart) ? (value as { cart: unknown[] }).cart : []
  const rawSelection = value && typeof value === 'object' ? (value as { selection?: unknown }).selection : undefined
  const selection = rawSelection && typeof rawSelection === 'object' ? rawSelection as Record<string, unknown> : null
  const kind = selection && AI_ENTITY_KINDS.includes(selection.kind as (typeof AI_ENTITY_KINDS)[number]) ? selection.kind as (typeof AI_ENTITY_KINDS)[number] : undefined
  const id = typeof selection?.id === 'string' ? selection.id.slice(0, 100) : ''; const label = typeof selection?.label === 'string' ? selection.label.trim().slice(0, 160) : ''
  const page = safePageContext(value && typeof value === 'object' ? (value as { page?: unknown }).page : undefined)
  return { cart: cart.slice(0, 20).flatMap((raw) => { if (!raw || typeof raw !== 'object') return []; const item = raw as Record<string, unknown>; const partId = typeof item.partId === 'string' ? item.partId.slice(0, 100) : ''; const name = typeof item.name === 'string' ? item.name.trim().slice(0, 160) : ''; const quantity = Number(item.quantity); const price = Number(item.price); return partId && name && Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0 ? [{ partId, name, quantity: Math.min(quantity, 1000), price: Math.min(price, 100000000) }] : [] }), ...(kind && id && label ? { selection: { kind, id, label } } : {}), ...(page ? { page } : {}) }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || 'UnknownError') }
type AIProviderAttempt = { provider: AIProviderTarget; model: string; status: 'success' | 'failed' | 'skipped'; durationMs: number; stepCount: number; error?: string }
function providerModelName(provider: AIProviderTarget) {
  const openRouterModels: Partial<Record<AIProviderTarget, string>> = { 'openrouter-text-pool-a': 'openrouter/free-tool-pool-a', 'openrouter-text-pool-b': 'openrouter/free-tool-pool-b', 'openrouter-vision-pool': 'openrouter/free-vision-pool', openrouter: 'openrouter/free' }
  return openRouterModels[provider] || (provider === 'gateway' ? `google/${aiModel()}` : aiModel())
}
function attemptTimeout(_complexity: 'quick' | 'standard' | 'heavy', hasImage: boolean, provider?: AIProviderTarget) {
  if (provider === 'gateway') return 5_000
  if (provider === 'google') return hasImage ? 12_000 : 10_000
  return hasImage ? 12_000 : 9_000
}
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
type DirectResult = {
  answer: string
  cards: AIToolCard[]
  sources?: Array<{ type: 'source-url'; sourceId: string; url: string; title?: string }>
}
async function appendDirectResult(input: { result: DirectResult; conversationId: string; expiresAt?: string; requestId: string; event: string; startedAt: number }) {
  const parts = responseParts(input.result, input.requestId)
  await appendAIMessage({ conversationId: input.conversationId, role: 'assistant', content: input.result.answer, metadata: { parts } })
  console.info(JSON.stringify({ event: input.event, requestId: input.requestId, cards: input.result.cards.length, durationMs: Date.now() - input.startedAt }))
}
function directResultResponse(result: DirectResult, metadata: GhyarAIMessage['metadata']) {
  const requestId = metadata?.requestId || randomUUID()
  const stream = createUIMessageStream<GhyarAIMessage>({ execute: ({ writer }) => {
    writer.write({ type: 'start', messageMetadata: metadata })
    writer.write({ type: 'text-start', id: requestId }); writer.write({ type: 'text-delta', id: requestId, delta: result.answer }); writer.write({ type: 'text-end', id: requestId })
    for (const source of result.sources || []) writer.write(source)
    result.cards.forEach((card, index) => { const toolCallId = `${requestId}-${index}`; writer.write({ type: 'tool-input-available', toolCallId, toolName: 'prepareAction', input: {}, dynamic: true }); writer.write({ type: 'tool-output-available', toolCallId, output: card, dynamic: true }) })
  } })
  return createUIMessageStreamResponse({ stream })
}
function responseParts(result: DirectResult, requestId: string): GhyarAIMessage['parts'] {
  const parts: GhyarAIMessage['parts'] = [{ type: 'text', text: result.answer }]
  for (const source of result.sources || []) parts.push(source)
  result.cards.forEach((card, index) => parts.push({ type: 'dynamic-tool', toolName: 'prepareAction', toolCallId: `${requestId}-${index}`, state: 'output-available', input: {}, output: card, dynamic: true } as GhyarAIMessage['parts'][number]))
  return parts
}
function duplicateAIResponse(requestId: string) {
  return NextResponse.json({ error: 'DUPLICATE_AI_REQUEST', requestId, duplicate: true }, { status: 409, headers: { 'Cache-Control': 'no-store', 'X-AI-Duplicate': '1' } })
}
function safeClientRequestId(value: unknown) {
  if (typeof value !== 'string') return undefined
  const candidate = value.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 160)
  return candidate || undefined
}
function friendlyAIError(error: unknown, requestId: string) {
  const message = errorMessage(error)
  if (/429|rate.?limit|resource.?exhausted/i.test(message)) return `وصل Gemini إلى حد الاستخدام المجاني للمشروع حالياً. حاول بعد قليل. رقم الطلب: ${requestId}`
  if (/timeout|timed out|abort/i.test(message)) return `استغرق Gemini وقتاً أطول من الحد المتاح. اختصر الطلب أو حاول مرة أخرى. رقم الطلب: ${requestId}`
  if (message === 'AI_UNAVAILABLE') return `مفتاح Gemini غير مضاف إلى الخادم بعد. رقم الطلب: ${requestId}`
  return `تعذر على Gemini إكمال الطلب حالياً، ولم يتم استخدام موديل بديل. رقم الطلب: ${requestId}`
}
