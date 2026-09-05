import { planAIRequest as basePlanAIRequest } from './planner.ts'
import type { AIConversationContext } from './context.ts'
import type { AIRole } from './types.ts'

export { cleanWebSearchQuery } from './planner.ts'

function isConversationalMarketplaceFalsePositive(message: string) {
  const text = message.normalize('NFKC').replace(/\s+/g, ' ').trim()
  const signupRequest = /(?:\b(?:register|sign\s*up|create|make|open|need|want)\b.{0,40}\b(?:account|seller)\b|\baccount\b.{0,24}\b(?:create|make|register|seller)\b|(?:عايز|عاوز|اريد|أريد|ازاي|إزاي).{0,32}(?:حساب|اكونت|أكونت|اسجل|أسجل|بائع)|(?:اعمل|أعمل).{0,16}(?:حساب|اكونت|أكونت)|(?:اسجل|أسجل).{0,20}(?:الموقع|حساب|بائع)|(?:ابقى|ابقي|أبقى|أبقي).{0,12}بائع)/i.test(text)
  const imageReferenceQuestion = /(?:\bwhat\s+(?:is|are)\s+(?:this|that)\b|\bwhat\s+(?:car|vehicle).{0,48}\b(?:this|that|part|photo|image)\b|\b(?:this|that)\s+part.{0,48}\b(?:car|vehicle|belong)\b|(?:ايه|إيه)\s+(?:ده|دا|دي|هذه|هذا)|(?:القطعة|الصورة)\s+دي.{0,48}(?:عربية|سيارة|ايه|إيه))/i.test(text)
  return signupRequest || imageReferenceQuestion
}

/**
 * Preserve the mature classifier for complexity/observability hints, but do
 * not let regex classification decide what the user meant. Every normal chat
 * request reaches the model with the complete server-derived role-safe tool
 * set, and the model decides whether a tool is needed after reading the full
 * conversational context.
 */
export function planAIRequest(message: string, role: AIRole, context?: AIConversationContext) {
  const base = basePlanAIRequest(message, role, context)

  // These intents previously triggered route-level deterministic behavior, or
  // are known classifier false positives for conversational signup/image asks.
  // Keep them model-routed instead of treating the regex classifier as truth.
  const normalizeToConversation = base.intent === 'seller_message_workflow'
    || base.intent === 'seller_insights'
    || (base.intent === 'marketplace_search' && isConversationalMarketplaceFalsePositive(message))
  const intent = normalizeToConversation ? 'conversation' : base.intent

  return {
    ...base,
    intent,
    tools: [],
    forcedTool: undefined,
    plannerMode: 'structured-agent' as const,
    // Auto-selected tools need a follow-up model step to explain their result.
    maxSteps: base.complexity === 'heavy' ? 5 : base.complexity === 'standard' ? 4 : 3,
  }
}
