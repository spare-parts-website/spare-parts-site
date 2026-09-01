'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, viewToPath, type View } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Bell, Check, Package, CreditCard, ShoppingCart, Star, Info, MessageSquare, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  link?: string | null
  createdAt: string
}

const TYPE_ICONS: Record<string, any> = {
  NEW_ORDER: ShoppingCart,
  ORDER_STATUS: Package,
  PAYMENT: CreditCard,
  REVIEW: Star,
  CHAT: MessageSquare,
  SYSTEM: Info,
}

const TYPE_COLORS: Record<string, string> = {
  NEW_ORDER: 'bg-emerald-500',
  ORDER_STATUS: 'bg-blue-500',
  PAYMENT: 'bg-amber-500',
  REVIEW: 'bg-purple-500',
  CHAT: 'bg-primary',
  SYSTEM: 'bg-muted-foreground',
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'الآن'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 7) return `قبل ${days} يوم`
  return date.toLocaleDateString('ar-EG')
}

function getNotificationDestination(notification: Notification, userRole: string): View | null {
  if (notification.type === 'CHAT') {
    return userRole === 'SHOP_OWNER'
      ? { name: 'shop-dashboard', tab: 'messages' }
      : { name: 'inbox' }
  }

  if (!notification.link) return null

  const [viewName, tab] = notification.link.split(':')
  if (viewName === 'shop-dashboard') {
    return {
      name: 'shop-dashboard',
      tab: (tab || 'orders') as 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages',
    }
  }
  if (viewName === 'admin-dashboard') {
    return {
      name: 'admin-dashboard',
      tab: tab as 'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports' | undefined,
    }
  }
  if (viewName === 'orders') return { name: 'orders' }
  if (viewName === 'inbox') return { name: 'inbox' }
  if (viewName === 'wishlist') return { name: 'wishlist' }
  return null
}

export function NotificationsBell() {
  const router = useRouter()
  const user = useAppStore((state) => state.user)
  const notificationCount = useAppStore((state) => state.notificationCount)
  const setNotificationCount = useAppStore((state) => state.setNotificationCount)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const loadingRef = useRef(false)

  // Fetch initial notifications
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = 15000

    if (!user) {
      setNotifications([])
      setNotificationCount(0)
      setConnected(false)
      return () => { cancelled = true }
    }

    const load = async (resetDelay = false) => {
      if (cancelled || loadingRef.current || document.visibilityState !== 'visible') return
      loadingRef.current = true
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' })
        if (!response.ok) throw new Error('notifications-request-failed')
        const data = await response.json()
        if (cancelled) return
        setNotifications(data.notifications || [])
        setNotificationCount(data.unreadCount || 0)
        setConnected(true)
        delay = resetDelay ? 15000 : 15000
      } catch {
        if (!cancelled) {
          setConnected(false)
          delay = Math.min(delay * 2, 120000)
        }
      } finally {
        loadingRef.current = false
        if (!cancelled) timer = setTimeout(() => void load(), delay)
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer)
        delay = 15000
        void load(true)
      } else if (timer) {
        clearTimeout(timer)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void load(true)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, setNotificationCount])

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setNotificationCount(0)
  }

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notification.id }),
    })
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
    )
    setNotificationCount(Math.max(0, useAppStore.getState().notificationCount - 1))
    setOpen(false)
    const destination = getNotificationDestination(notification, user?.role || '')
    if (destination) router.push(viewToPath(destination))
  }

  if (!user) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
          <span className="sr-only">الإشعارات</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" showClose={false} className="w-96 p-0 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="size-5" />
            الإشعارات
          </SheetTitle>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-2 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-muted-foreground'
              )}
              title={connected ? 'متصل' : 'غير متصل'}
            />
            {notificationCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                <Check className="size-4 ml-1" />
                تعليم الكل كمقروء
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="ghost" size="icon" aria-label="إغلاق الإشعارات" title="إغلاق الإشعارات">
                <X className="size-5" />
              </Button>
            </SheetClose>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground px-4">
              <Bell className="size-10 mx-auto mb-2 opacity-40" />
              <p>لا توجد إشعارات بعد</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Info
                const color = TYPE_COLORS[n.type] || 'bg-muted-foreground'
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      'w-full text-right p-4 hover:bg-muted/50 transition flex gap-3',
                      !n.read && 'bg-primary/5'
                    )}
                  >
                    <div className={cn('size-9 rounded-full flex items-center justify-center shrink-0 text-white', color)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm line-clamp-1">{n.title}</p>
                        {!n.read && <span className="size-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
