'use client'

import { useEffect, useState } from 'react'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare, Package, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

interface Thread {
  partId: string
  part: { id: string; name: string; image?: string | null }
  buyerId: string
  buyer: { id: string; name: string }
  lastMessage: { message: string; createdAt: string }
  unreadCount: number
}

const MESSAGE_CACHE_TTL = 15_000
const messageCache = new Map<string, { fetchedAt: number; threads: Thread[] }>()
const messageInFlight = new Map<string, Promise<Thread[]>>()

export async function warmSellerMessages(userId: string, force = false) {
  const cached = messageCache.get(userId)
  if (!force && cached && Date.now() - cached.fetchedAt < MESSAGE_CACHE_TTL) return cached.threads
  const pending = messageInFlight.get(userId)
  if (!force && pending) return pending

  const request = fetch('/api/chat?scope=shop', { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'SHOP_MESSAGES_LOAD_FAILED')
      const threads = (data.threads || []) as Thread[]
      messageCache.set(userId, { fetchedAt: Date.now(), threads })
      return threads
    })
    .finally(() => messageInFlight.delete(userId))

  messageInFlight.set(userId, request)
  return request
}

export function ShopMessagesView() {
  const navigate = useAppNavigation()
  const { toast } = useToast()
  const userId = useAppStore((state) => state.user?.id)
  const cached = userId ? messageCache.get(userId)?.threads || [] : []
  const hasCached = Boolean(userId && messageCache.has(userId))
  const [threads, setThreads] = useState<Thread[]>(cached)
  const [loading, setLoading] = useState(!hasCached)

  const load = (force = false) => {
    if (!userId) {
      setThreads([])
      setLoading(false)
      return Promise.resolve([] as Thread[])
    }
    const current = messageCache.get(userId)?.threads
    if (current) {
      setThreads(current)
      setLoading(false)
    } else {
      setLoading(true)
    }
    return warmSellerMessages(userId, force)
      .then((next) => {
        setThreads(next)
        return next
      })
      .catch((error) => {
        toast({ title: 'تعذر تحميل الرسائل', description: error instanceof Error ? error.message : 'تحقق من اتصالك ثم حاول مرة أخرى', variant: 'destructive' })
        return [] as Thread[]
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 15000)
    return () => clearInterval(interval)
  }, [userId])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">رسائل العملاء</h2>
        <p className="text-sm text-muted-foreground">أسئلة العملاء عن قطعك قبل الشراء</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <MessageSquare className="size-12 mx-auto mb-3 opacity-40" />
            <p>لا توجد رسائل عن منتجاتك بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Card key={`${thread.partId}:${thread.buyerId}`} className={thread.unreadCount ? 'border-primary/50 bg-primary/5' : ''}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
                  {thread.part.image ? <img src={thread.part.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package className="size-6 text-muted-foreground/50" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{thread.part.name}</p>
                  <p className="text-sm flex items-center gap-1 text-muted-foreground">
                    <User className="size-3.5" /> {thread.buyer.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message}</p>
                </div>
                <Button size="sm" onClick={() => navigate({ name: 'chat', partId: thread.partId, participantId: thread.buyerId })}>
                  <MessageSquare className="size-4 ml-1" />
                  فتح
                  {thread.unreadCount > 0 && <span className="mr-1 rounded-full bg-red-500 text-white px-1.5 text-xs">{thread.unreadCount}</span>}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
