import { db } from '@/lib/db'
import { AI_HISTORY_TTL_MS } from '@/lib/ai/runtime'
import type { SessionUser } from '@/lib/auth'
import { deleteUploadedFiles } from '@/lib/storage'
import { attachmentUrls, storedMessageToUIMessage } from '@/lib/ai/messages'

export function nextConversationExpiry() {
  return new Date(Date.now() + AI_HISTORY_TTL_MS)
}

export async function purgeExpiredAIData() {
  const now = new Date()
  const expired = await db.aIConversation.findMany({ where: { expiresAt: { lte: now } }, include: { messages: true } })
  const urls = expired.flatMap((conversation) => attachmentUrls(conversation.messages.map(storedMessageToUIMessage)))
  if (urls.length) await deleteUploadedFiles(urls)
  await db.aIRequestLease.deleteMany({ where: { expiresAt: { lte: now } } })
  await db.aIActionProposal.deleteMany({ where: { expiresAt: { lte: now } } })
  return db.aIConversation.deleteMany({ where: { expiresAt: { lte: now } } })
}

export async function deleteAIConversation(id: string, user: SessionUser) {
  const conversation = await db.aIConversation.findFirst({ where: { id, userId: user.id }, include: { messages: true } })
  if (!conversation) return false
  await deleteUploadedFiles(attachmentUrls(conversation.messages.map(storedMessageToUIMessage)))
  const deleted = await db.aIConversation.deleteMany({ where: { id, userId: user.id } })
  return deleted.count > 0
}

export async function getOrCreateConversation(input: {
  conversationId?: string
  user: SessionUser
  firstMessage: string
}) {
  const expiresAt = nextConversationExpiry()
  if (input.conversationId) {
    const existing = await db.aIConversation.findFirst({
      where: { id: input.conversationId, userId: input.user.id, role: input.user.role, expiresAt: { gt: new Date() } },
    })
    if (!existing) throw new Error('CONVERSATION_NOT_FOUND')
    return db.aIConversation.update({ where: { id: existing.id }, data: { expiresAt } })
  }
  return db.aIConversation.create({
    data: {
      userId: input.user.id,
      role: input.user.role,
      title: input.firstMessage.slice(0, 80),
      expiresAt,
    },
  })
}

export async function loadConversationMessages(conversationId: string, user: SessionUser) {
  const conversation = await db.aIConversation.findFirst({
    where: { id: conversationId, userId: user.id, role: user.role, expiresAt: { gt: new Date() } },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 30 } },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  return conversation.messages.reverse()
}

export async function appendAIMessage(input: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  metadata?: unknown
}) {
  return db.aIMessage.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content.slice(0, input.role === 'user' ? 4000 : 12000),
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata).slice(0, 12000),
    },
  })
}
