import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canAccessPrivateImage } from '@/lib/private-image-access'

const BUCKET = 'protected-uploads'
const SAFE_PATH = /^[A-Za-z0-9._-]{20,220}$/

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(); const path = new URL(req.url).searchParams.get('path') || ''
    if (!SAFE_PATH.test(path)) return new NextResponse(null, { status: 404 })
    const privateUrl = `/api/private-image?path=${encodeURIComponent(path)}`
    // A filename is only an opaque lookup key. Authorization is derived from
    // the database resource that references it, so recipients can access
    // shared attachments without relying on the uploader id in the filename.
    const [chat, productMessage, dispute, verification, aiMessage] = await Promise.all([
      db.chatMessage.findFirst({ where: { imageUrl: { contains: privateUrl } }, select: { senderId: true, receiverId: true } }),
      db.productMessage.findFirst({ where: { imageUrl: { contains: privateUrl } }, select: { senderId: true, receiverId: true } }),
      db.dispute.findFirst({ where: { evidenceUrls: { contains: privateUrl } }, select: { buyerId: true, store: { select: { ownerId: true } } } }),
      db.sellerVerification.findFirst({ where: { documentUrls: { contains: privateUrl } }, select: { store: { select: { ownerId: true } } } }),
      db.aIMessage.findFirst({ where: { content: { contains: privateUrl } }, select: { conversation: { select: { userId: true } } } }),
    ])
    const participantIds = new Set<string>()
    if (chat) { participantIds.add(chat.senderId); participantIds.add(chat.receiverId) }
    if (productMessage) { participantIds.add(productMessage.senderId); participantIds.add(productMessage.receiverId) }
    if (dispute) { participantIds.add(dispute.buyerId); participantIds.add(dispute.store.ownerId) }
    if (verification) participantIds.add(verification.store.ownerId)
    if (aiMessage) participantIds.add(aiMessage.conversation.userId)
    if (!canAccessPrivateImage(session, participantIds.size ? { participantIds } : null)) return new NextResponse(null, { status: 404 })
    const base = process.env.SUPABASE_URL?.replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!base || !key) return new NextResponse(null, { status: 503 })
    const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key }, cache: 'no-store' })
    if (!response.ok) return new NextResponse(null, { status: 404 })
    return new NextResponse(response.body, { headers: { 'Content-Type': response.headers.get('content-type') || 'image/webp', 'Cache-Control': 'private, max-age=300' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
