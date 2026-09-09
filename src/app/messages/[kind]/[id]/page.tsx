import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChatView } from '@/components/views/chat-view'

export const metadata: Metadata = { title: 'المحادثة', robots: { index: false, follow: false } }
export default async function MessagePage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ participant?: string }> }) {
  const { kind, id } = await params
  const { participant } = await searchParams
  if (kind === 'order') return <ChatView orderId={id} />
  if (kind === 'part') return <ChatView partId={id} participantId={typeof participant === 'string' ? participant : undefined} />
  notFound()
}
