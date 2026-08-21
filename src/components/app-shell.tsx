'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { LockKeyhole, ShieldX } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { useAppStore, type AuthUser, type CartItem, type View } from '@/lib/store'
import { Button } from '@/components/ui/button'

const CART_STORAGE_KEY = 'ghyar-market-cart-v1'
const AUTH_USER_CACHE_KEY = 'ghyar-market-user-v1'

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

function readCachedUser(): AuthUser | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(AUTH_USER_CACHE_KEY) || 'null')
    if (!value || typeof value !== 'object') return null
    const user = value as Partial<AuthUser>
    if (
      typeof user.id !== 'string' ||
      typeof user.name !== 'string' ||
      typeof user.email !== 'string' ||
      !['BUYER', 'ADMIN', 'SHOP_OWNER'].includes(String(user.role))
    ) return null
    return user as AuthUser
  } catch {
    return null
  }
}

export function AppShell({
  children,
  initialView,
  initialSearch = '',
}: {
  children: ReactNode
  initialView: View
  initialSearch?: string
}) {
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const hydratedCart = useRef(false)
  const [authResolved, setAuthResolved] = useState(false)

  // Restore the last known account before the browser paints a newly navigated page.
  // The request below immediately verifies it against the HttpOnly session cookie.
  useLayoutEffect(() => {
    if (!useAppStore.getState().user) {
      const cachedUser = readCachedUser()
      if (cachedUser) setUser(cachedUser)
    }
  }, [setUser])

  useEffect(() => {
    useAppStore.setState({ view: initialView, searchQuery: initialSearch })
    window.scrollTo({ top: 0 })
  }, [initialSearch, initialView])

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
    return useAppStore.subscribe((state) => {
      if (hydratedCart.current) {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart))
      }
    })
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((data: { user?: AuthUser | null }) => {
        if (active) setUser(data.user || null)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setAuthResolved(true)
      })
    return () => {
      active = false
    }
  }, [setUser])

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

  const requiredRoles = rolesForView(initialView)
  const protectedContent = requiredRoles !== null
  const canAccess = !protectedContent || (user && (requiredRoles.length === 0 || requiredRoles.includes(user.role)))

  return (
    <div className="min-h-screen flex flex-col pb-20 lg:pb-0">
      <Header user={user} />
      <main className="flex-1">
        {protectedContent && !authResolved ? <ProtectedLoading /> : canAccess ? children : user ? <ForbiddenState /> : <SignInState />}
      </main>
      <Footer />
      <CartDrawer />
      <MobileBottomNav />
    </div>
  )
}

function rolesForView(view: View): AuthUser['role'][] | null {
  if (view.name === 'shop-dashboard') return ['SHOP_OWNER']
  if (view.name === 'admin-dashboard') return ['ADMIN']
  if (['orders', 'wishlist', 'checkout'].includes(view.name)) return ['BUYER', 'SHOP_OWNER']
  if (['profile', 'inbox', 'chat'].includes(view.name)) return []
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
