import { planDeterministicRequest as basePlanDeterministicRequest } from './deterministic.ts'

export type { DeterministicRequest } from './deterministic.ts'
export {
  deterministicToolInput,
  accountFocus,
  sellerInsightFocus,
  adminInsightFocus,
  sellerListingState,
  sellerOrderStatus,
  sellerCouponState,
  sellerMessageState,
} from './deterministic.ts'

type PlanInput = Parameters<typeof basePlanDeterministicRequest>[0]
type PlanResult = ReturnType<typeof basePlanDeterministicRequest>

/**
 * Model-first release mode.
 *
 * The legacy deterministic parser is still exported for low-level parsing
 * helpers and tests, but it must never answer a user request or pre-execute a
 * guessed tool before the language model has interpreted the conversation.
 * This prevents broad keyword/regex matches from turning natural requests
 * into unrelated account, marketplace, navigation, or action responses.
 */
export function planDeterministicRequest(_input: PlanInput): PlanResult {
  return undefined
}
