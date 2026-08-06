'use client'

import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight, Send, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  message: string
  senderId: string
  sender: { id: string; name: string }
  createdAt: string
  read: boolean
}

export function ChatView({ orderId }: { orderId: string }) {
  const { user, setView } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = () => {
    fetch(`/api/chat?orderId=${orderId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setMessages(data.messages || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Poll every 5 seconds for new messages
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [orderId])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, message: input.trim() }),
      })
      const data = await res.json()
      if (!res.ok) return
      setMessages((prev) => [...prev, data.message])
      setInput('')
    } finally {
      setSending(false)
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
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => setView({ name: 'orders' })} className="mb-4">
        <ArrowRight className="size-4 ml-1" />
        العودة للطلبات
      </Button>

      <Card className="h-[70vh] flex flex-col">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="size-5 text-primary" />
            محادثة حول الطلب
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
                <p className="text-sm">ابدأ المحادثة بإرسال رسالة</p>
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
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
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
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب رسالتك..."
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || sending}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
