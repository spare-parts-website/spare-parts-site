import { db } from '@/lib/db'

export async function audit(input: { actorId?: string | null; action: string; targetType: string; targetId?: string | null; metadata?: unknown }) {
  try {
    await db.auditLog.create({ data: { actorId: input.actorId || null, action: input.action, targetType: input.targetType, targetId: input.targetId || null, metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata).slice(0, 4000) } })
  } catch (error) {
    console.error('Audit log error:', error)
  }
}
