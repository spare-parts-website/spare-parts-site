import type { AIRole, AIClientContext, AISelectedEntity } from '@/lib/ai/types'
import type { GhyarAIMessage } from '@/lib/ai/messages'

export type AIPageContext = {
  pathname: string
  title?: string
  query?: string
  entity?: AISelectedEntity
  dashboard?: 'public' | 'buyer' | 'seller' | 'admin' | 'support' | 'messages'
}

export type AIConversationContext = {
  role: AIRole
  recentMessages: Array<{ role: 'user' | 'assistant'; text: string }>
  previousToolResults: Array<{ type: string; title: string; description?: string; items: string[] }>
  /** Internal references recovered from prior result cards. IDs are never sent to the model. */
  previousEntities?: AISelectedEntity[]
  selectedEntity?: AISelectedEntity
  previousSearch?: string
  currentPage?: AIPageContext
  cart: { itemCount: number; total: number; items: Array<{ name: string; quantity: number; price: number }> }
  dashboardScope?: string
  promptInjectionSuspected: boolean
}

const MAX_RECENT_MESSAGES = 8
const MAX_TOOL_RESULTS = 6
const MAX_TEXT = 800

/** Build the bounded, server-validated context used before intent planning. */
export function buildAIConversationContext(input: {
  messages: GhyarAIMessage[]
  currentMessage: string
  role: AIRole
  clientContext: AIClientContext
}): AIConversationContext {
  const recentMessages = input.messages.slice(-MAX_RECENT_MESSAGES).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
    text: message.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim().slice(0, MAX_TEXT),
  })).filter((message) => message.text)

  const entityGroups = input.messages.flatMap((message) => message.parts.flatMap((part) => {
    const candidate = part as unknown as { type?: unknown; output?: unknown }
    if (candidate.type !== 'dynamic-tool' || !candidate.output || typeof candidate.output !== 'object') return []
    const card = candidate.output as { items?: unknown }
    if (!Array.isArray(card.items)) return []
    const entities = card.items.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const select = (item as { select?: unknown }).select
      return safeSelectedEntity(select)
    }).filter((entity): entity is AISelectedEntity => Boolean(entity))
    return entities.length ? [entities] : []
  }))
  // Follow-ups refer to the most recently rendered result card. Keeping the
  // last group avoids resolving “the second one” against stale cards from
  // earlier turns while still bounding the context to eight entities.
  const previousEntities = entityGroups.at(-1)?.slice(0, 8) ?? []

  const previousToolResults = input.messages.flatMap((message) => message.parts.flatMap((part) => {
    const candidate = part as unknown as { type?: unknown; output?: unknown }
    if (candidate.type !== 'dynamic-tool' || !candidate.output || typeof candidate.output !== 'object') return []
    const card = candidate.output as { type?: unknown; title?: unknown; description?: unknown; items?: unknown }
    const items = Array.isArray(card.items)
      ? card.items.slice(0, 6).flatMap((item) => item && typeof item === 'object' && typeof (item as { title?: unknown }).title === 'string' ? [(item as { title: string }).title.slice(0, 160)] : [])
      : []
    return typeof card.title === 'string' ? [{ type: typeof card.type === 'string' ? card.type : 'result', title: card.title.slice(0, 160), description: typeof card.description === 'string' ? card.description.slice(0, MAX_TEXT) : undefined, items }] : []
  })).slice(-MAX_TOOL_RESULTS)

  const cartItems = input.clientContext.cart.slice(0, 20).map((item) => ({ name: item.name.slice(0, 160), quantity: item.quantity, price: item.price }))
  const selectedEntity = input.clientContext.selection || input.clientContext.page?.entity
  // Only a user's own search request can seed a follow-up query. Assistant
  // prose may mention the word "search" while summarising a result and must
  // never become an implicit database query.
  const previousSearch = [...recentMessages].reverse().filter((message) => message.role === 'user').map((message) => message.text).find((text) => /(?:ابحث|دور|search|find|looking for)/i.test(text))
  const currentPage = input.clientContext.page
  return {
    role: input.role,
    recentMessages,
    previousToolResults,
    ...(selectedEntity ? { selectedEntity } : {}),
    ...(previousEntities.length ? { previousEntities } : {}),
    ...(previousSearch ? { previousSearch: previousSearch.slice(0, MAX_TEXT) } : {}),
    ...(currentPage ? { currentPage } : {}),
    cart: { itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0), total: cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0), items: cartItems },
    ...(currentPage?.dashboard ? { dashboardScope: currentPage.dashboard } : {}),
    promptInjectionSuspected: [input.currentMessage, ...previousToolResults.flatMap((result) => [result.title, result.description || '', ...result.items])].some(containsPromptInjection),
  }
}

/** Keep model-facing context free of internal IDs and untrusted instructions. */
export function formatAIConversationContext(context: AIConversationContext) {
  return JSON.stringify({
    role: context.role,
    recentMessages: context.recentMessages,
    previousToolResults: context.previousToolResults,
    selectedEntity: context.selectedEntity ? { kind: context.selectedEntity.kind, label: context.selectedEntity.label } : undefined,
    previousEntities: context.previousEntities?.map((entity) => ({ kind: entity.kind, label: entity.label })),
    previousSearch: context.previousSearch,
    currentPage: context.currentPage ? { pathname: context.currentPage.pathname, title: context.currentPage.title, query: context.currentPage.query, entity: context.currentPage.entity ? { kind: context.currentPage.entity.kind, label: context.currentPage.entity.label } : undefined } : undefined,
    dashboardScope: context.dashboardScope,
    cart: context.cart,
    promptInjectionSuspected: context.promptInjectionSuspected,
  })
}

export function containsPromptInjection(value: string) {
  return /(?:ignore|disregard|forget|override)\s+(?:all|any|previous|prior|system|developer)|(?:تجاهل|تخط[ّ]?ى|انس[َأ]?|الغِ|تجاوز)\s+(?:كل|أي|التعليمات|التعليمات السابقة)|(?:reveal|show|print)\s+(?:system|developer|hidden)\s+(?:prompt|instructions)|(?:اكشف|اعرض)\s+(?:التعليمات|البرومبت|الأسرار)/i.test(value)
}

export function dashboardForPath(pathname: string): AIPageContext['dashboard'] {
  if (pathname === '/support' || pathname.startsWith('/support/')) return 'support'
  if (pathname === '/account/messages' || pathname.startsWith('/messages/')) return 'messages'
  if (pathname === '/seller' || pathname.startsWith('/seller/')) return 'seller'
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  if (pathname === '/account' || pathname.startsWith('/account/')) return 'buyer'
  return 'public'
}

export function safePageContext(value: unknown): AIPageContext | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const pathname = typeof raw.pathname === 'string' && /^\/[A-Za-z0-9_?=&%./-]{0,180}$/.test(raw.pathname) ? raw.pathname : ''
  if (!pathname) return undefined
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 160) : undefined
  const query = typeof raw.query === 'string' ? raw.query.trim().slice(0, 160) : undefined
  const entity = safeSelectedEntity(raw.entity) || entityFromPath(pathname, title)
  const dashboard = ['public', 'buyer', 'seller', 'admin', 'support', 'messages'].includes(String(raw.dashboard)) ? raw.dashboard as AIPageContext['dashboard'] : dashboardForPath(pathname)
  return { pathname, ...(title ? { title } : {}), ...(query ? { query } : {}), ...(entity ? { entity } : {}), ...(dashboard ? { dashboard } : {}) }
}

function safeSelectedEntity(value: unknown): AISelectedEntity | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const kinds = ['part', 'store', 'order', 'user', 'report', 'verification', 'dispute', 'coupon', 'message', 'review', 'support_ticket']
  if (!kinds.includes(String(raw.kind)) || typeof raw.id !== 'string' || typeof raw.label !== 'string') return undefined
  if (!raw.id || !raw.label.trim()) return undefined
  return { kind: raw.kind as AISelectedEntity['kind'], id: raw.id.slice(0, 100), label: raw.label.trim().slice(0, 160) }
}

function entityFromPath(pathname: string, title?: string): AISelectedEntity | undefined {
  const match = pathname.match(/^\/(parts|stores)\/([^/?#]+)$/i)
  if (!match) return undefined
  let id = match[2]
  try { id = decodeURIComponent(id) } catch { return undefined }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return undefined
  const kind = match[1].toLowerCase() === 'parts' ? 'part' : 'store'
  return { kind, id, label: title?.trim().slice(0, 160) || (kind === 'part' ? 'القطعة الحالية' : 'المتجر الحالي') }
}

/** Resolve ordinal/pronoun references against bounded result-card entities. */
export function resolveContextSelection(context: AIConversationContext, message: string) {
  const activeEntity = context.selectedEntity || context.currentPage?.entity
  const entities = context.previousEntities || []
  if (/(?:التاني|الثاني|الثانية|رقم\s*2|second|2nd)/i.test(message)) return entities[1] || entities.at(-1)
  if (/(?:التالت|الثالث|الثالثة|رقم\s*3|third|3rd)/i.test(message)) return entities[2] || entities.at(-1)
  if (/(?:الأول|الاول|الأولى|أول(?:\s+نتيجة|\s+واحد)?|اول(?:\s+نتيجة|\s+واحد)?|first|1st)/i.test(message)) return entities[0]
  if (activeEntity && /(?:ده|دي|هذا|هذه|هو|هي|it|this|the one|السعر|سعره|بكام|كام|how much|منه|منها|له|لها|من انهي متجر|which store)/i.test(message)) return activeEntity
  if (!entities.length) return activeEntity
  if (/(?:آخر|الأحدث|الاحدث|latest|last)/i.test(message)) return entities.at(-1)
  return activeEntity
}
