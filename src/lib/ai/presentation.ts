import type { AIToolCard } from '@/lib/ai/types'

export function presentAIResponse(modelAnswer: string, cards: AIToolCard[]) {
  const importantCards = cards.filter(isImportantCard)
  const inlineCards = cards.filter((card) => !isImportantCard(card))
  const inlineText = inlineCards.map(cardToMarkdown).filter(Boolean).join('\n\n')
  const trimmedAnswer = modelAnswer.trim()
  const usefulAnswer = isProcessOnlyAnswer(trimmedAnswer) ? '' : trimmedAnswer
  const alreadyCovered = inlineCards.length > 0 && inlineCards.every((card) => answerCoversCard(usefulAnswer, card))
  const answer = [usefulAnswer, alreadyCovered ? '' : inlineText].filter(Boolean).join('\n\n').trim()

  return {
    answer: answer || (importantCards.length ? 'اختر أو راجع الإجراء المطلوب بالأسفل.' : 'تم تجهيز النتيجة المطلوبة.'),
    cards: importantCards,
  }
}

function isImportantCard(card: AIToolCard) {
  if (card.clientAction) return true
  if (card.proposal || card.type === 'proposal') return true
  // A result with a validated href is still interactive. Keep it as a card so
  // the renderer can expose the keyboard-accessible “فتح” CTA instead of
  // flattening an internal navigation target into plain prose.
  if (card.items?.some((item) => item.href)) return true
  const selectable = card.items?.filter((item) => item.select).length || 0
  // A single selectable result is still an actionable entity. Keep it as a
  // structured card so the user can select/open it instead of burying it in
  // prose (the UI must not refer to a list that was not rendered).
  if (selectable === 1) return true
  return selectable > 1 && /(?:اختر|حد[ّ]?د|المقصود|نتائج البحث|قطع متوافقة)/i.test(card.title)
}

function isProcessOnlyAnswer(answer: string) {
  if (!answer) return true
  return answer.length < 220 && /^(?:سأقوم|سوف أقوم|دعني|هبحث|سأبحث|سأحلل|جاري|I(?:'ll| will)|Let me)(?:\s|[:،.]|$)/i.test(answer)
}

function answerCoversCard(answer: string, card: AIToolCard) {
  if (!answer) return false
  const normalizedAnswer = normalize(answer)
  const title = normalize(card.title)
  if (title.length >= 8 && normalizedAnswer.includes(title)) return true
  const values = card.items?.map((item) => String(item.value ?? '')).filter((value) => value.length > 0) || []
  return values.length > 0 && values.every((value) => normalizedAnswer.includes(normalize(value)))
}

function cardToMarkdown(card: AIToolCard) {
  const lines = [`**${safeLabel(card.title)}**`]
  if (card.description) lines.push(card.description.trim())
  for (const item of (card.items || []).slice(0, 6)) {
    const details = [item.subtitle, item.value !== undefined ? String(item.value) : ''].filter(Boolean).join(' — ')
    const link = item.href && /^https?:\/\//i.test(item.href) ? ` — [فتح المصدر](${item.href})` : ''
    lines.push(`- **${safeLabel(item.title)}**${details ? ` — ${details}` : ''}${link}`)
  }
  if ((card.items?.length || 0) > 6) lines.push(`- و${card.items!.length - 6} نتائج إضافية`)
  return lines.join('\n')
}

function safeLabel(value: string) {
  return value.replace(/[\[\]]/g, '').trim()
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim()
}
