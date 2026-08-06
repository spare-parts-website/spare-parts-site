'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'
import { HomeView } from '@/components/views/home-view'
import { AuthView } from '@/components/views/auth-view'
import { StoresView } from '@/components/views/stores-view'
import { PartsView } from '@/components/views/parts-view'
import { PartView } from '@/components/views/part-view'
import { StoreView } from '@/components/views/store-view'
import { OrdersView } from '@/components/views/orders-view'
import { ProfileView } from '@/components/views/profile-view'
import { ShopDashboardView } from '@/components/views/shop-dashboard-view'
import { AdminDashboardView } from '@/components/views/admin-dashboard-view'
import { CheckoutView } from '@/components/views/checkout-view'
import { WishlistView } from '@/components/views/wishlist-view'
import { MyCarsView } from '@/components/views/my-cars-view'
import { ChatView } from '@/components/views/chat-view'
import { InboxView } from '@/components/views/inbox-view'
import { LegalView } from '@/components/views/legal-view'
import type { AuthUser } from '@/lib/store'

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
        {view.name === 'my-cars' && <MyCarsView />}
        {view.name === 'chat' && 'orderId' in view && <ChatView orderId={view.orderId} />}
        {view.name === 'chat' && 'partId' in view && <ChatView partId={view.partId} participantId={view.participantId} />}
      </main>
      <Footer />
      <CartDrawer />
    </div>
  )
}
