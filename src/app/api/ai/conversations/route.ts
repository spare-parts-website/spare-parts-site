import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await requireAuth()
    const conversations = await db.aIConversation.findMany({ where: { userId: user.id, role: user.role, expiresAt: { gt: new Date() } }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 30 } }, orderBy: { updatedAt: 'desc' }, take: 10 })
    return NextResponse.json({ conversations: conversations.map((conversation) => { const messages = conversation.messages.reverse().map((message) => ({ id: message.id, role: message.role, content: message.content, metadata: parseMetadata(message.metadata), createdAt: message.createdAt })); const preview = messages.find((message) => message.role === 'user')?.content?.trim() || messages.at(-1)?.content?.trim() || null; return { id: conversation.id, title: conversation.title?.trim() || null, preview, expiresAt: conversation.expiresAt, updatedAt: conversation.updatedAt, messages } }) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'غير مصرح' : 'تعذر تحميل المحادثات' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'معرف المحادثة مطلوب' }, { status: 400 })
    const deleted = await db.aIConversation.deleteMany({ where: { id, userId: user.id } })
    if (!deleted.count) return NextResponse.json({ error: 'المحادثة غير موجودة' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'غير مصرح' : 'تعذر حذف المحادثة' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}

function parseMetadata(value: string | null) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}
