import { z } from 'zod'
import { presentAIResponse } from './presentation.ts'
import { roleCanPrepareAction } from './policy.ts'
import { AI_ACTIONS, AI_ENTITY_KINDS, type AIResponseGuardResult, type AIRole, type AIToolCard, type AISelectedEntity } from './types.ts'
import { containsInteractiveInstruction, hasUnsupportedFactLanguage } from './normalization.ts'

const SAFE_INTERNAL_HREF = /^\/(?:parts|stores|cart|checkout|account|seller|admin|support|messages)(?:[/?#]|$)/i
const SAFE_EXTERNAL_HREF = /^https?:\/\/[^\s]+$/i
const TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

const selectedEntitySchema = z.object({
  kind: z.enum(AI_ENTITY_KINDS),
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(160),
})

const clientActionSchema = z.object({
  type: z.enum(['navigate', 'draft', 'cart_add', 'cart_update', 'cart_remove', 'cart_clear']),
  href: z.string().max(500).optional(),
  target: z.string().max(80).optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  cartItem: z.object({
    partId: z.string().max(100), name: z.string().max(160), price: z.number().finite().nonnegative(), image: z.string().max(500).nullable().optional(),
    storeId: z.string().max(100), storeName: z.string().max(160), quantity: z.number().int().positive(), stock: z.number().int().nonnegative(),
  }).optional(),
  cartPartId: z.string().max(100).optional(), cartQuantity: z.number().int().positive().optional(),
})

const proposalSchema = z.object({
  id: z.string().min(1).max(120), action: z.enum(AI_ACTIONS), summary: z.string().min(1).max(1000), expiresAt: z.string().max(60),
  targetId: z.string().max(100).optional(), riskTier: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  currentState: z.string().max(1000).optional(), proposedState: z.string().max(1000).optional(), consequences: z.string().max(1000).optional(),
})

const cardSchema = z.object({
  type: z.enum(['results', 'insight', 'navigation', 'draft', 'proposal']),
  title: z.string().min(1).max(160), description: z.string().max(1200).optional(),
  items: z.array(z.object({
    id: z.string().min(1).max(120), title: z.string().min(1).max(160), subtitle: z.string().max(500).optional(),
    href: z.string().max(500).optional(), value: z.union([z.string(), z.number()]).optional(), select: selectedEntitySchema.optional(),
  })).max(20).optional(),
  clientAction: clientActionSchema.optional(), proposal: proposalSchema.optional(),
})

type GuardInput = {
  role: AIRole
  intent: string
  answer?: string
  parts?: unknown[]
  cards?: unknown[]
}

/** The only boundary through which model output becomes user-visible. */
export function guardAIResponse(input: GuardInput): AIResponseGuardResult {
  const reasons: string[] = []
  const rawParts = input.parts || []
  const modelAnswer = (input.answer || rawParts.flatMap((part) => {
    if (!part || typeof part !== 'object') return []
    const candidate = part as { type?: unknown; text?: unknown }
    return candidate.type === 'text' && typeof candidate.text === 'string' ? [candidate.text] : []
  }).join('\n')).replace(TEXT_CONTROL_CHARS, '').trim().slice(0, 8000)
  const rawCards = input.cards || rawParts.flatMap((part) => {
    if (!part || typeof part !== 'object') return []
    const candidate = part as { type?: unknown; state?: unknown; output?: unknown }
    const isToolPart = candidate.type === 'dynamic-tool' || (typeof candidate.type === 'string' && candidate.type.startsWith('tool-'))
    return isToolPart && candidate.state === 'output-available' && candidate.output ? [candidate.output] : []
  })
  const cards = dedupeCards(rawCards.flatMap((card) => {
    const safe = sanitizeAIToolCard(card, input.role)
    if (!safe) reasons.push('invalid_card')
    return safe ? [safe] : []
  }))
  const sources = rawParts.flatMap((part) => {
    if (!part || typeof part !== 'object') return []
    const candidate = part as { type?: unknown; sourceId?: unknown; url?: unknown; title?: unknown }
    if (candidate.type !== 'source-url' || typeof candidate.sourceId !== 'string' || typeof candidate.url !== 'string' || !SAFE_EXTERNAL_HREF.test(candidate.url)) return []
    return [{ type: 'source-url' as const, sourceId: candidate.sourceId.slice(0, 120), url: candidate.url.slice(0, 500), ...(typeof candidate.title === 'string' && candidate.title.trim() ? { title: candidate.title.trim().slice(0, 240) } : {}) }]
  })

  let safeAnswer = modelAnswer
  if (containsInteractiveInstruction(modelAnswer) && !hasMatchingAffordance(modelAnswer, cards)) {
    reasons.push('phantom_control_instruction')
    safeAnswer = ''
  }
  if (/(?:تم\s*(?:تنفيذ|إضافة|تغيير)|executed successfully|added to (?:the )?cart|updated successfully)/i.test(modelAnswer)) {
    reasons.push('unconfirmed_action_claim')
    safeAnswer = ''
  }

  const strictEvidenceIntent = /(?:marketplace|compatibility|checkout|selection|search)/i.test(input.intent)
  const hasUsefulEvidence = cards.some((card) => Boolean(card.items?.length || card.proposal || card.clientAction || card.description))
  const asksForClarificationOrNoMatch = /(?:لم\s*(?:أجد|اجد|نجد|نلاقي|نعثر)|لا\s*(?:توجد?|يوجد|يوجد?\s+نتائج)|(?:مفيش|مفيش)\s*(?:نتائج|قطع|عروض)|غير\s+متوفر|اذكر|اكتب|حدد|اختر|provide|clarif|no\s+results?|couldn['’]?t\s+find|not\s+enough\s+data|unable\s+to\s+verify)/i.test(modelAnswer)
  if (strictEvidenceIntent && !hasUsefulEvidence && (hasUnsupportedFactLanguage(modelAnswer) || !asksForClarificationOrNoMatch)) {
    reasons.push(hasUnsupportedFactLanguage(modelAnswer) ? 'unsupported_marketplace_claim' : 'missing_evidence')
    safeAnswer = ''
  }

  // Marketplace/selection facts must be rendered from the validated cards,
  // not from free-form model prose that could contain a different price,
  // stock count, or fitment claim.
  const presented = presentAIResponse(strictEvidenceIntent && cards.length ? '' : safeAnswer, cards)
  const rejected = reasons.length > 0
  const fallback = rejected && !presented.cards.length
    ? (isEnglish(modelAnswer) ? 'I could not verify that action or marketplace fact from the available data. Please provide the part name or choose a visible result.' : 'لم أستطع توثيق هذا الإجراء أو المعلومة من البيانات المتاحة. اكتب اسم القطعة أو اختر نتيجة ظاهرة.')
    : presented.answer
  return { answer: fallback, cards: presented.cards, sources, rejected, reasons: [...new Set(reasons)] }
}

export function sanitizeAIToolCard(value: unknown, role?: AIRole): AIToolCard | undefined {
  const parsed = cardSchema.safeParse(value)
  if (!parsed.success) return undefined
  const raw = parsed.data
  const title = cleanText(raw.title, 160)
  if (!title) return undefined
  let invalidItem = false
  const items = raw.items?.flatMap((item) => {
    const href = item.href && isSafeHref(item.href) ? item.href.slice(0, 500) : undefined
    const select = item.select ? sanitizeSelection(item.select) : undefined
    if (item.href && !href && !select) { invalidItem = true; return [] }
    const itemId = cleanText(item.id, 120); const itemTitle = cleanText(item.title, 160)
    if (!itemId || !itemTitle) { invalidItem = true; return [] }
    return [{ id: itemId, title: itemTitle, ...(item.subtitle ? { subtitle: cleanText(item.subtitle, 500) } : {}), ...(href ? { href } : {}), ...(item.value !== undefined ? { value: typeof item.value === 'number' ? item.value : cleanText(item.value, 160) } : {}), ...(select ? { select } : {}) }]
  })
  if (invalidItem) return undefined
  const clientAction = sanitizeClientAction(raw.clientAction, role)
  const proposal = role && raw.proposal && roleCanPrepareAction(role, raw.proposal.action) && isFutureDate(raw.proposal.expiresAt)
    ? { ...raw.proposal, summary: cleanText(raw.proposal.summary, 1000), expiresAt: raw.proposal.expiresAt, ...(raw.proposal.currentState ? { currentState: cleanText(raw.proposal.currentState, 1000) } : {}), ...(raw.proposal.proposedState ? { proposedState: cleanText(raw.proposal.proposedState, 1000) } : {}), ...(raw.proposal.consequences ? { consequences: cleanText(raw.proposal.consequences, 1000) } : {}) }
    : role && raw.proposal ? undefined : raw.proposal
  if (proposal && !proposal.summary) return undefined
  if (raw.proposal && !proposal) return undefined
  if (raw.clientAction && !clientAction) return undefined
  return {
    type: raw.type,
    title,
    ...(raw.description ? { description: cleanText(raw.description, 1200) } : {}),
    ...(items?.length ? { items } : {}),
    ...(clientAction ? { clientAction } : {}),
    ...(proposal ? { proposal } : {}),
  }
}

function sanitizeClientAction(value: z.infer<typeof clientActionSchema> | undefined, role?: AIRole) {
  if (!value) return undefined
  // Model output can prepare navigation/drafts, but mutations only arrive from
  // the separately confirmed /api/ai/actions endpoint.
  if (!['navigate', 'draft'].includes(value.type)) return undefined
  const href = value.href && isSafeHref(value.href) ? value.href.slice(0, 500) : undefined
  if (value.type === 'navigate' && (!href || !SAFE_INTERNAL_HREF.test(href))) return undefined
  if (value.type === 'draft' && (!value.target || (role && !draftAllowedForRole(role, value.target)))) return undefined
  const fields = value.fields ? Object.fromEntries(Object.entries(value.fields).slice(0, 20).map(([key, field]) => [cleanText(key, 80), typeof field === 'string' ? cleanText(field, 500) : field])) : undefined
  return { type: value.type, ...(href ? { href } : {}), ...(value.target ? { target: cleanText(value.target, 80) } : {}), ...(fields ? { fields } : {}) } as AIToolCard['clientAction']
}

function draftAllowedForRole(role: AIRole, target: string) {
  if (target === 'search') return true
  if (role === 'GUEST') return false
  if (target === 'message') return role === 'BUYER' || role === 'SHOP_OWNER'
  if (target === 'listing' || target === 'coupon') return role === 'SHOP_OWNER'
  if (target === 'moderation_note') return role === 'ADMIN'
  return false
}

function hasMatchingAffordance(text: string, cards: AIToolCard[]) {
  const selectable = cards.some((card) => card.items?.some((item) => item.select))
  const openable = cards.some((card) => Boolean(card.clientAction || card.items?.some((item) => item.href)))
  const reviewable = cards.some((card) => Boolean(card.proposal))
  if (/(?:اختيار|select)/i.test(text)) return selectable
  if (/(?:فتح|open|navigate)/i.test(text)) return openable
  // The visible proposal CTA is “مراجعة وتنفيذ”, never an unrendered
  // “تطبيق/تأكيد” button. Treat those phantom labels as unavailable.
  if (/(?:تأكيد|confirm|apply|تطبيق|طب[ّ]?ق)/i.test(text)) return false
  if (/(?:مراجعة|review|تنفيذ|execute)/i.test(text)) return reviewable
  return selectable || openable || reviewable
}

function sanitizeSelection(value: AISelectedEntity) {
  return selectedEntitySchema.safeParse(value).success ? { kind: value.kind, id: cleanText(value.id, 100), label: cleanText(value.label, 160) } : undefined
}

function isSafeHref(value: string) {
  return SAFE_INTERNAL_HREF.test(value) || SAFE_EXTERNAL_HREF.test(value)
}

function cleanText(value: string, max: number) {
  return value.replace(TEXT_CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isFutureDate(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now() - 60_000
}

function dedupeCards(cards: AIToolCard[]) {
  const seen = new Set<string>()
  return cards.filter((card) => {
    const key = card.proposal?.id || `${card.type}:${card.title}:${card.items?.map((item) => item.id).join(',') || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isEnglish(value: string) {
  return /[A-Za-z]/.test(value) && !/[\u0600-\u06FF]/.test(value)
}
