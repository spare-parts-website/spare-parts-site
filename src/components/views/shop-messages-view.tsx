'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare, Package, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

interface Thread {
  kind: 'order' | 'product'
  orderId?: string
  partId: string
  participantId?: string
  part: { id: string; name: string; image?: string | null }
  otherUser: { id: string; name: string }
  lastMessage: { message: string; createdAt: string }
  unreadCount: number
}

const MESSAGE_CACHE_TTL = 30_000
const messageCache = new Map<string, { fetchedAt: number; threads: Thread[] }>()

export async function warmSellerMessages(userId: string, force = false) {
  const cached = messageCache.get(userId)
  if (!force && cached && Date.now() - cached.fetchedAt < MESSAGE_CACHE_TTL) return cached.threads
  const response = await fetch('/api/chat/threads?scope=shop&limit=25', { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error || 'SHOP_MESSAGES_LOAD_FAILED')
  const threads = (data.threads || []) as Thread[]
  messageCache.set(userId, { fetchedAt: Date.now(), threads })
  return threads
}

function key(thread: Thread) { return `${thread.kind}:${thread.orderId || thread.partId}:${thread.otherUser.id}` }
function merge(current: Thread[], incoming: Thread[]) {
  const map = new Map(current.map((thread) => [key(thread), thread]))
  for (const thread of incoming) map.set(key(thread), thread)
  return [...map.values()].sort((a, b) => Date.parse(b.lastMessage.createdAt) - Date.parse(a.lastMessage.createdAt))
}

export function ShopMessagesView() {
  const navigate = useAppNavigation()
  const { toast } = useToast()
  const userId = useAppStore((state) => state.user?.id)
  const [threads, setThreads] = useState<Thread[]>(userId ? messageCache.get(userId)?.threads || [] : [])
  const [loading, setLoading] = useState(!(userId && messageCache.has(userId)))
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const loadedMoreRef = useRef(false)

  const updateCursor = (value: string | null) => { cursorRef.current = value; setNextCursor(value) }
  const load = async (options: { append?: boolean; quiet?: boolean } = {}) => {
    if (!userId) { setThreads([]); setLoading(false); return }
    const append = Boolean(options.append)
    const cursor = append ? cursorRef.current : null
    if (append && !cursor) return
    if (append) setLoadingMore(true)
    try {
      const params = new URLSearchParams({ scope: 'shop', limit: '25' })
      if (cursor) params.set('cursor', cursor)
      const response = await fetch(`/api/chat/threads?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الرسائل')
      const incoming = (data.threads || []) as Thread[]
      setThreads((current) => append || options.quiet ? merge(current, incoming) : incoming)
      if (!append) messageCache.set(userId, { fetchedAt: Date.now(), threads: incoming })
      if (append) { loadedMoreRef.current = true; updateCursor(data.nextCursor || null) }
      else if (!options.quiet || !loadedMoreRef.current) updateCursor(data.nextCursor || null)
    } catch (error) {
      if (!options.quiet) toast({ title: 'تعذر تحميل الرسائل', description: error instanceof Error ? error.message : 'تحقق من اتصالك ثم حاول مرة أخرى', variant: 'destructive' })
    } finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => {
    loadedMoreRef.current = false
    cursorRef.current = null
    void load()
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void load({ quiet: true }) }, 60_000)
    return () => clearInterval(interval)
  }, [userId])

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">رسائل العملاء</h2><p className="text-sm text-muted-foreground">محادثات الطلبات وأسئلة العملاء عن قطعك</p></div>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : threads.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground"><MessageSquare className="size-12 mx-auto mb-3 opacity-40" /><p>لا توجد رسائل بعد</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Card key={key(thread)} className={thread.unreadCount ? 'border-primary/50 bg-primary/5' : ''}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">{thread.part.image ? <img src={thread.part.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package className="size-6 text-muted-foreground/50" />}</div>
                <div className="min-w-0 flex-1"><p className="font-semibold truncate">{thread.part.name}</p><p className="text-sm flex items-center gap-1 text-muted-foreground"><User className="size-3.5" /> {thread.otherUser.name}</p><p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message || 'صورة مرفقة'}</p></div>
                <Button size="sm" onClick={() => navigate(thread.kind === 'order' ? { name: 'chat', orderId: thread.orderId! } : { name: 'chat', partId: thread.partId, participantId: thread.participantId })}><MessageSquare className="size-4 ml-1" />فتح{thread.unreadCount > 0 && <span className="mr-1 rounded-full bg-red-500 text-white px-1.5 text-xs">{thread.unreadCount}</span>}</Button>
              </CardContent>
            </Card>
          ))}
          {nextCursor && <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void load({ append: true })}>{loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}</Button></div>}
        </div>
      )}
    </div>
  )
}
