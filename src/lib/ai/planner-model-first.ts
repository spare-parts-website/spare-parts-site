import { planAIRequest as basePlanAIRequest } from './planner.ts'
import type { AIConversationContext } from './context.ts'
import type { AIRole } from './types.ts'

export { cleanWebSearchQuery } from './planner.ts'

/**
 * Preserve the mature classifier for complexity/observability hints, but do
 * not let regex classification decide what the user meant. Every normal chat
 * request reaches the model with the complete server-derived role-safe tool
 * set, and the model decides whether a tool is needed after reading the full
 * conversational context.
 */
export function planAIRequest(message: string, role: AIRole, context?: AIConversationContext) {
  const base = basePlanAIRequest(message, role, context)

  // These two intents previously triggered route-level deterministic early
  // returns. Normalize them so seller requests also pass through the model.
  const intent = base.intent === 'seller_message_workflow' || base.intent === 'seller_insights'
    ? 'conversation'
    : base.intent

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
