'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LockKeyhole, ShieldX } from 'lucide-react'
import { AIAssistantLoader } from '@/components/ai-assistant-loader'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { useAppStore, type AuthUser, type CartItem } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { PwaInstaller } from '@/components/pwa-installer'

const CART_STORAGE_KEY = 'ghyar-market-cart-v1'
const CART_UPDATED_KEY = 'ghyar-market-cart-updated-v1'

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CartItem>
  return (
    typeof item.partId === 'string' &&
    typeof item.name === 'string' &&
    typeof item.price === 'number' &&
    typeof item.storeId === 'string' &&
    typeof item.storeName === 'string' &&
    typeof item.quantity === 'number' &&
    typeof item.stock === 'number'
  )
}

export function AppShell({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const hydratedCart = useRef(false)
  const reminderSent = useRef(false)
  const [authResolved, setAuthResolved] = useState(false)

  // Resolve the HttpOnly session once for the lifetime of the persistent shell.
  // Public SSR remains identity-free; this client overlay restores account
  // controls after hydration without putting identity into shared HTML caches.
  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ user?: AuthUser | null }> : { user: null })
      .then((data) => { if (active) setUser(data.user || null) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setAuthResolved(true) })
    return () => { active = false }
  }, [setUser])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  // Once the account shell is idle, quietly warm the role-specific dashboard
  // data. This keeps low-end devices responsive during first paint while making
  // later dashboard menu changes render from memory instead of a loading state.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      void import('@/lib/dashboard-warmup')
        .then((module) => user.role === 'SHOP_OWNER'
          ? module.warmSellerDashboard(user.id)
          : user.role === 'ADMIN'
            ? module.warmAdminDashboard(user.id)
            : undefined)
        .catch(() => {})
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const handle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(run, { timeout: 1800 })
      : window.setTimeout(run, 900)
    return () => {
      cancelled = true
      if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) idleWindow.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
      if (storedCart) {
        const parsed: unknown = JSON.parse(storedCart)
        if (Array.isArray(parsed)) {
          useAppStore.setState({ cart: parsed.filter(isCartItem) })
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    }

    hydratedCart.current = true
    return useAppStore.subscribe((state, previous) => {
      if (hydratedCart.current && state.cart !== previous.cart) {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart))
        window.localStorage.setItem(CART_UPDATED_KEY, String(Date.now()))
      }
    })
  }, [])

  useEffect(() => {
    if (!user || !hydratedCart.current || reminderSent.current) return
    const cart = useAppStore.getState().cart
    const updatedAt = Number(window.localStorage.getItem(CART_UPDATED_KEY) || 0)
    if (cart.length && updatedAt && Date.now() - updatedAt > 86400000) {
      reminderSent.current = true
      void fetch('/api/cart-reminders', { method: 'POST' })
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      useAppStore.getState().setFavoriteStores([])
      return
    }

    let active = true
    fetch('/api/wishlist', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: Array<{ store: { id: string } }> }) => {
        if (active) {
          useAppStore.getState().setFavoriteStores((data.items || []).map((item) => item.store.id))
        }
      })
      .catch(() => {
        if (active) useAppStore.getState().setFavoriteStores([])
      })
    return () => {
      active = false
    }
  }, [user])

  const requiredRoles = rolesForPath(pathname)
  const protectedContent = requiredRoles !== null
  const canAccess = !protectedContent || (authResolved && user && (requiredRoles.length === 0 || requiredRoles.includes(user.role)))

  return (
    <div className="min-h-screen flex flex-col pb-20 lg:pb-0">
      <Header />
      <main className="flex-1">
        {protectedContent && !authResolved ? <ProtectedLoading /> : canAccess ? children : user ? <ForbiddenState /> : <SignInState />}
      </main>
      <Footer />
      <CartDrawer />
      <MobileBottomNav />
      <PwaInstaller />
      <AIAssistantLoader user={user} pathname={pathname} />
    </div>
  )
}

function rolesForPath(pathname: string): AuthUser['role'][] | null {
  if (pathname === '/seller' || pathname.startsWith('/seller/')) return ['SHOP_OWNER']
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return ['ADMIN']
  if (pathname === '/checkout' || pathname === '/account/orders') return ['BUYER', 'SHOP_OWNER']
  if (pathname === '/account/wishlist') return ['BUYER', 'SHOP_OWNER', 'ADMIN']
  if (pathname === '/account/profile' || pathname === '/account/messages' || pathname === '/support' || pathname.startsWith('/messages/')) return []
  return null
}

function ProtectedLoading() {
  return <div className="content-container grid min-h-[55vh] place-items-center"><div className="text-center"><span className="mx-auto block size-12 animate-pulse rounded-2xl bg-primary/15" /><p className="mt-4 text-sm text-muted-foreground">جاري التحقق من الحساب...</p></div></div>
}

function SignInState() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><div className="max-w-md text-center"><span className="mx-auto grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary"><LockKeyhole className="size-9" /></span><h1 className="mt-6 text-2xl font-black">سجّل الدخول للمتابعة</h1><p className="mt-3 leading-7 text-muted-foreground">هذه الصفحة مرتبطة بحسابك وبياناتك الشخصية.</p><Button asChild className="mt-6"><Link href="/login">تسجيل الدخول</Link></Button></div></div>
}

function ForbiddenState() {
  return <div className="content-container grid min-h-[55vh] place-items-center py-16"><div className="max-w-md text-center"><span className="mx-auto grid size-20 place-items-center rounded-3xl bg-destructive/10 text-destructive"><ShieldX className="size-9" /></span><h1 className="mt-6 text-2xl font-black">لا تملك صلاحية لهذه الصفحة</h1><p className="mt-3 leading-7 text-muted-foreground">استخدم الحساب المناسب أو عد إلى الصفحة الرئيسية.</p><Button asChild variant="outline" className="mt-6"><Link href="/">العودة للرئيسية</Link></Button></div></div>
}
