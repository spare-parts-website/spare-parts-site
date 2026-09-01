'use client'

import { useEffect, useState } from 'react'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Package, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Thread {
  kind: 'order' | 'product'
  orderId?: string
  partId?: string
  participantId?: string
  part: { id: string; name: string; image?: string | null }
  storeName?: string
  otherUser: { id: string; name: string }
  lastMessage: { message: string; imageUrl?: string | null; createdAt: string }
  unreadCount: number
}

export function InboxView() {
  const navigate = useAppNavigation()
  const { toast } = useToast()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const response = await fetch('/api/chat?scope=inbox', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الرسائل')
      setThreads(data.threads || [])
    } catch (error: any) {
      toast({ title: 'تعذر تحميل الرسائل', description: error.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="content-container max-w-3xl space-y-6 py-10">
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">التواصل</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">الرسائل</h1>
        <p className="text-muted-foreground mt-1">كل محادثاتك مع العملاء والمتاجر في مكان واحد</p>
        </div>
      </div>
      {loading ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground">جاري تحميل الرسائل...</CardContent></Card>
      ) : threads.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <MessageSquare className="size-12 mx-auto mb-3 opacity-40" />
          <p>لا توجد رسائل بعد</p>
          <p className="text-sm mt-1">ستظهر هنا أسئلة المنتجات ومحادثات الطلبات</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Card key={`${thread.kind}:${thread.orderId || thread.partId}:${thread.otherUser.id}`} className={`market-card ${thread.unreadCount ? 'border-primary/50 bg-primary/5' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-12 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
                  {thread.part.image ? <img src={thread.part.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Package className="size-6 text-muted-foreground/50" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{thread.part.name}</p>
                  <p className="text-sm flex items-center gap-1 text-muted-foreground"><User className="size-3.5" /> {thread.otherUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{thread.lastMessage.message || 'صورة مرفقة'}</p>
                </div>
                {thread.unreadCount > 0 && <Badge variant="destructive">جديد</Badge>}
                <Button size="sm" onClick={() => navigate(thread.kind === 'order' ? { name: 'chat', orderId: thread.orderId! } : { name: 'chat', partId: thread.partId!, participantId: thread.participantId })}>
                  فتح
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
