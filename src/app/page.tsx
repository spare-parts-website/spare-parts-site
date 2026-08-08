'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAppStore } from '@/lib/store'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'
import { HomeView } from '@/components/views/home-view'
import type { AuthUser } from '@/lib/store'

const ViewLoading = () => <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">جاري تحميل الصفحة...</div>
const AuthView = dynamic(() => import('@/components/views/auth-view').then((module) => module.AuthView), { loading: ViewLoading })
const StoresView = dynamic(() => import('@/components/views/stores-view').then((module) => module.StoresView), { loading: ViewLoading })
const PartsView = dynamic(() => import('@/components/views/parts-view').then((module) => module.PartsView), { loading: ViewLoading })
const PartView = dynamic(() => import('@/components/views/part-view').then((module) => module.PartView), { loading: ViewLoading })
const StoreView = dynamic(() => import('@/components/views/store-view').then((module) => module.StoreView), { loading: ViewLoading })
const OrdersView = dynamic(() => import('@/components/views/orders-view').then((module) => module.OrdersView), { loading: ViewLoading })
const ProfileView = dynamic(() => import('@/components/views/profile-view').then((module) => module.ProfileView), { loading: ViewLoading })
const ShopDashboardView = dynamic(() => import('@/components/views/shop-dashboard-view').then((module) => module.ShopDashboardView), { loading: ViewLoading })
const AdminDashboardView = dynamic(() => import('@/components/views/admin-dashboard-view').then((module) => module.AdminDashboardView), { loading: ViewLoading })
const CheckoutView = dynamic(() => import('@/components/views/checkout-view').then((module) => module.CheckoutView), { loading: ViewLoading })
const WishlistView = dynamic(() => import('@/components/views/wishlist-view').then((module) => module.WishlistView), { loading: ViewLoading })
const ChatView = dynamic(() => import('@/components/views/chat-view').then((module) => module.ChatView), { loading: ViewLoading })
const InboxView = dynamic(() => import('@/components/views/inbox-view').then((module) => module.InboxView), { loading: ViewLoading })
const LegalView = dynamic(() => import('@/components/views/legal-view').then((module) => module.LegalView), { loading: ViewLoading })

export default function Home() {
  const { view, user, setUser } = useAppStore()
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user as AuthUser)
      })
      .finally(() => setBootstrapped(true))
  }, [setUser])

  useEffect(() => {
    if (!user) {
      useAppStore.getState().setFavoriteStores([])
      return
    }
    fetch('/api/wishlist', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => useAppStore.getState().setFavoriteStores((data.items || []).map((item: { store: { id: string } }) => item.store.id)))
      .catch(() => useAppStore.getState().setFavoriteStores([]))
  }, [user])

  // Scroll to top on view change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header user={null} />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} />
      <main className="flex-1">
        {view.name === 'home' && <HomeView />}
        {view.name === 'stores' && <StoresView />}
        {view.name === 'store' && <StoreView storeId={view.storeId} />}
        {view.name === 'parts' && <PartsView />}
        {view.name === 'part' && <PartView partId={view.partId} />}
        {view.name === 'login' && <AuthView mode="login" />}
        {view.name === 'register' && <AuthView mode="register" />}
        {view.name === 'orders' && <OrdersView />}
        {view.name === 'profile' && <ProfileView />}
        {view.name === 'inbox' && <InboxView />}
        {view.name === 'legal' && <LegalView page={view.page} />}
        {view.name === 'shop-dashboard' && <ShopDashboardView tab={view.tab} />}
        {view.name === 'admin-dashboard' && <AdminDashboardView tab={view.tab} />}
        {view.name === 'checkout' && <CheckoutView />}
        {view.name === 'wishlist' && <WishlistView />}
        {view.name === 'chat' && 'orderId' in view && <ChatView orderId={view.orderId} />}
        {view.name === 'chat' && 'partId' in view && <ChatView partId={view.partId} participantId={view.participantId} />}
      </main>
      <Footer />
      <CartDrawer />
    </div>
  )
}
