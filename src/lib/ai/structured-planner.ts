import { z } from 'zod'
import { capabilitiesForRole, capabilityForTool, roleCanUseCapability, type AICapabilityId } from './capabilities.ts'
import type { AIConversationContext } from '@/lib/ai/context'
import type { AIRole, AIToolName } from '@/lib/ai/types'

const plannerArgument = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(160)).max(20)])

export const structuredAIPlanSchema = z.object({
  goal: z.string().trim().min(1).max(500),
  steps: z.array(z.object({
    capability: z.string().trim().min(1).max(100),
    arguments: z.record(z.string().max(80), plannerArgument).default({}),
    dependsOn: z.array(z.number().int().min(0).max(15)).max(8).default([]),
    requiresConfirmation: z.boolean().default(false),
  })).min(1).max(8),
  needsClarification: z.boolean().default(false),
  clarification: z.string().trim().max(300).optional(),
})

export type StructuredAIPlan = z.infer<typeof structuredAIPlanSchema> & {
  steps: Array<z.infer<typeof structuredAIPlanSchema>['steps'][number] & { capability: AICapabilityId }>
}

export type StructuredPlanValidation =
  | { ok: true; plan: StructuredAIPlan }
  | { ok: false; error: 'INVALID_PLAN' | 'CAPABILITY_FORBIDDEN' | 'WRITE_WITHOUT_CONFIRMATION'; capability?: string }

/** Validate model output and apply the server role policy after parsing. */
export function validateStructuredAIPlan(value: unknown, role: AIRole): StructuredPlanValidation {
  const parsed = structuredAIPlanSchema.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'INVALID_PLAN' }
  const steps: StructuredAIPlan['steps'] = []
  for (const step of parsed.data.steps) {
    if (!roleCanUseCapability(role, step.capability)) return { ok: false, error: 'CAPABILITY_FORBIDDEN', capability: step.capability }
    const capability = capabilitiesForRole(role).find((candidate) => candidate.id === step.capability)
    if (!capability) return { ok: false, error: 'CAPABILITY_FORBIDDEN', capability: step.capability }
    if (capability.readOrWrite === 'write' && !step.requiresConfirmation) return { ok: false, error: 'WRITE_WITHOUT_CONFIRMATION', capability: step.capability }
    steps.push({ ...step, capability: capability.id })
  }
  if (parsed.data.needsClarification && !parsed.data.clarification) return { ok: false, error: 'INVALID_PLAN' }
  return { ok: true, plan: { ...parsed.data, steps } }
}

/** The prompt contains only role-safe capability IDs and redacted context. */
export function structuredPlannerInstructions(role: AIRole, context: AIConversationContext) {
  const exposed = capabilitiesForRole(role).map((capability) => `${capability.id} (${capability.readOrWrite}, T${capability.riskTier})`).join(', ')
  const redactedContext = {
    ...context,
    selectedEntity: context.selectedEntity ? { kind: context.selectedEntity.kind, label: context.selectedEntity.label } : undefined,
    previousEntities: context.previousEntities?.map((entity) => ({ kind: entity.kind, label: entity.label })),
    currentPage: context.currentPage ? { ...context.currentPage, entity: context.currentPage.entity ? { kind: context.currentPage.entity.kind, label: context.currentPage.entity.label } : undefined } : undefined,
  }
  return [
    'Return JSON matching the structured AI plan schema. Never return prose or tool names.',
    `Role: ${role}. Allowed capabilities: ${exposed}.`,
    'Read capability steps may run automatically. Every write step must set requiresConfirmation=true; it only creates a proposal and never executes a mutation.',
    'Use natural-language arguments and the supplied context. Never request secrets, passwords, technical IDs, SQL, infrastructure, or saved-car data.',
    `Bounded context: ${JSON.stringify(redactedContext)}`,
  ].join('\n')
}

export function capabilitiesForTools(tools: readonly AIToolName[]) {
  return [...new Set(tools.flatMap((tool) => { const capability = capabilityForTool(tool); return capability ? [capability.id] : [] }))]
}
