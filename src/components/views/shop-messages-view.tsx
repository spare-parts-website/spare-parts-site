'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare, Package, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Thread {
  partId: string
  part: { id: string; name: string; image?: string | null }
  buyerId: string
  buyer: { id: string; name: string }
  lastMessage: { message: string; createdAt: string }
  unreadCount: number
}

export function ShopMessagesView() {
  const { setView } = useAppStore()
  const { toast } = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/chat?scope=shop', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast({ title: 'تعذر تحميل الرسائل', description: data.error, variant: 'destructive' })
          return
        }
        setThreads(data.threads || [])
      })
      .catch(() => toast({ title: 'تعذر تحميل الرسائل', description: 'تحقق من اتصالك ثم حاول مرة أخرى', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

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
                  {thread.part.image ? <img src={thread.part.image} alt="" className="w-full h-full object-contain" /> : <Package className="size-6 text-muted-foreground/50" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{thread.part.name}</p>
                  <p className="text-sm flex items-center gap-1 text-muted-foreground">
                    <User className="size-3.5" /> {thread.buyer.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message}</p>
                </div>
                <Button size="sm" onClick={() => setView({ name: 'chat', partId: thread.partId, participantId: thread.buyerId })}>
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
