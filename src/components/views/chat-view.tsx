'use client'

import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight, Send, MessageSquare, Paperclip, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_INPUT_BYTES, IMAGE_UPLOAD_TYPES } from '@/lib/image-policy'

interface Message {
  id: string
  message: string
  senderId: string
  sender: { id: string; name: string }
  createdAt: string
  read: boolean
  imageUrl?: string | null
}

export function ChatView({ orderId, partId, participantId }: { orderId?: string; partId?: string; participantId?: string }) {
  const { user, setView } = useAppStore()
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachment, setAttachment] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = () => {
    const query = partId
      ? `partId=${encodeURIComponent(partId)}${participantId ? `&participantId=${encodeURIComponent(participantId)}` : ''}`
      : `orderId=${encodeURIComponent(orderId || '')}`
    fetch(`/api/chat?${query}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) toast({ title: 'تعذر تحميل المحادثة', description: data.error, variant: 'destructive' })
        setMessages(data.messages || [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 10000)
    return () => clearInterval(interval)
  }, [orderId, partId, participantId])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !attachment) || sending || uploading) return
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, partId, participantId, message: input.trim(), imageUrl: attachment }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'تعذر إرسال الرسالة', description: data.error, variant: 'destructive' })
        return
      }
      setMessages((prev) => [...prev, data.message])
      setInput('')
      setAttachment(null)
    } finally {
      setSending(false)
    }
  }

  const handleAttachment = async (file: File) => {
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      toast({ title: 'نوع الملف غير مدعوم', description: 'اختر صورة JPG أو PNG أو WebP', variant: 'destructive' })
      return
    }
    if (file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES) {
      toast({ title: 'الصورة كبيرة جداً', description: 'الحد الأقصى 4 ميجا', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('purpose', 'chat')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل رفع الصورة')
      setAttachment(data.url)
    } catch (error: any) {
      toast({ title: 'فشل رفع الصورة', description: error.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <MessageSquare className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-4">سجّل الدخول للدردشة</h2>
        <Button onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button>
      </div>
    )
  }

  return (
    <div className="content-container max-w-3xl py-10">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setView(partId ? { name: 'part', partId } : { name: 'orders' })}
        className="mb-4"
      >
        <ArrowRight className="size-4 ml-1" />
        العودة للطلبات
      </Button>

      <Card className="market-card flex h-[min(70vh,48rem)] min-h-[30rem] flex-col">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="size-5 text-primary" />
            {partId ? 'محادثة مع البائع' : 'محادثة حول الطلب'}
          </CardTitle>
        </CardHeader>

        {loading ? (
          <div className="flex-1 p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-2/3 rounded-lg" />
            ))}
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="size-12 mb-2 opacity-40" />
                <p>لا توجد رسائل بعد</p>
                <p className="text-sm">{partId ? 'اسأل البائع عن القطعة قبل الشراء' : 'ابدأ المحادثة بإرسال رسالة'}</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.senderId === user.id
                return (
                  <div
                    key={msg.id}
                    className={cn('flex', isMine ? 'justify-start' : 'justify-end')}
                  >
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-4 py-2',
                        isMine
                          ? 'bg-primary text-primary-foreground rounded-bl-sm'
                          : 'bg-muted rounded-br-sm'
                      )}
                    >
                      {!isMine && (
                        <p className="text-xs font-semibold mb-0.5 opacity-70">
                          {msg.sender.name}
                        </p>
                      )}
                        {msg.imageUrl && <img src={msg.imageUrl} alt="صورة مرفقة" loading="lazy" decoding="async" className="max-h-52 max-w-full rounded-lg object-contain mb-1" />}
                        {msg.message && <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>}
                      <p className={cn('text-xs mt-1', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        <div className="border-t p-3">
          {attachment && user.role !== 'BUYER' && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
              <img src={attachment} alt="المرفق" className="size-12 rounded object-cover" />
              <span className="flex-1">صورة جاهزة للإرسال</span>
              <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setAttachment(null)}><X className="size-4" /></Button>
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2">
            {user.role !== 'BUYER' && (
              <label className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="إرفاق صورة">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                <input type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" disabled={uploading || sending} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAttachment(file); e.currentTarget.value = '' }} />
              </label>
            )}
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={partId ? 'اسأل عن التوافق أو الحالة أو التوصيل...' : 'اكتب رسالتك...'}
              disabled={sending || uploading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={(!input.trim() && !attachment) || sending || uploading}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
