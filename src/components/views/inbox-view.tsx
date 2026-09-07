'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Package, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Thread {
  kind: 'order' | 'product'
  orderId?: string
  partId: string
  participantId?: string
  part: { id: string; name: string; image?: string | null }
  storeName?: string
  otherUser: { id: string; name: string }
  lastMessage: { message: string; imageUrl?: string | null; createdAt: string }
  unreadCount: number
}

function threadKey(thread: Thread) { return `${thread.kind}:${thread.orderId || thread.partId}:${thread.otherUser.id}` }
function mergeThreads(current: Thread[], incoming: Thread[]) {
  const byKey = new Map(current.map((thread) => [threadKey(thread), thread]))
  for (const thread of incoming) byKey.set(threadKey(thread), thread)
  return [...byKey.values()].sort((a, b) => Date.parse(b.lastMessage.createdAt) - Date.parse(a.lastMessage.createdAt))
}

export function InboxView() {
  const navigate = useAppNavigation()
  const { toast } = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const loadedMoreRef = useRef(false)

  const updateCursor = (value: string | null) => { cursorRef.current = value; setNextCursor(value) }
  const load = async (options: { append?: boolean; quiet?: boolean } = {}) => {
    const append = Boolean(options.append)
    const cursor = append ? cursorRef.current : null
    if (append && !cursor) return
    if (append) setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '25' })
      if (cursor) params.set('cursor', cursor)
      const response = await fetch(`/api/chat/threads?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الرسائل')
      const incoming = (data.threads || []) as Thread[]
      setThreads((current) => append || options.quiet ? mergeThreads(current, incoming) : incoming)
      if (append) {
        loadedMoreRef.current = true
        updateCursor(data.nextCursor || null)
      } else if (!options.quiet || !loadedMoreRef.current) {
        updateCursor(data.nextCursor || null)
      }
    } catch (error) {
      if (!options.quiet) toast({ title: 'تعذر تحميل الرسائل', description: error instanceof Error ? error.message : 'حاول مرة أخرى', variant: 'destructive' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void load({ quiet: true }) }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="content-container max-w-3xl space-y-6 py-10">
      <div className="page-heading mb-0"><div><p className="page-kicker">التواصل</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">الرسائل</h1><p className="text-muted-foreground mt-1">كل محادثاتك مع العملاء والمتاجر في مكان واحد</p></div></div>
      {loading ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground">جاري تحميل الرسائل...</CardContent></Card>
      ) : threads.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground"><MessageSquare className="size-12 mx-auto mb-3 opacity-40" /><p>لا توجد رسائل بعد</p><p className="text-sm mt-1">ستظهر هنا أسئلة المنتجات ومحادثات الطلبات</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Card key={threadKey(thread)} className={`market-card ${thread.unreadCount ? 'border-primary/50 bg-primary/5' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">{thread.part.image ? <img src={thread.part.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package className="size-6 text-muted-foreground/50" />}</div>
                <div className="min-w-0 flex-1"><p className="font-semibold truncate">{thread.part.name}</p><p className="text-sm flex items-center gap-1 text-muted-foreground"><User className="size-3.5" /> {thread.otherUser.name}</p><p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message || 'صورة مرفقة'}</p></div>
                {thread.unreadCount > 0 && <Badge variant="destructive">{thread.unreadCount}</Badge>}
                <Button size="sm" onClick={() => navigate(thread.kind === 'order' ? { name: 'chat', orderId: thread.orderId! } : { name: 'chat', partId: thread.partId, participantId: thread.participantId })}>فتح</Button>
              </CardContent>
            </Card>
          ))}
          {nextCursor && <div className="flex justify-center pt-2"><Button variant="outline" disabled={loadingMore} onClick={() => void load({ append: true })}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button></div>}
        </div>
      )}
    </div>
  )
}
