'use client'

import Link from 'next/link'
import { Heart, Home, PackageSearch, ShoppingCart, UserRound } from 'lucide-react'
import { useAppStore } from '@/lib/store'

export function MobileBottomNav() {
  const { view, cart, user, setCartOpen } = useAppStore()
  const items = [
    { label: 'الرئيسية', href: '/', icon: Home, active: view.name === 'home' },
    { label: 'القطع', href: '/parts', icon: PackageSearch, active: view.name === 'parts' || view.name === 'part' },
    { label: 'المفضلة', href: user ? '/account/wishlist' : '/login', icon: Heart, active: view.name === 'wishlist' },
    { label: 'حسابي', href: user ? '/account/profile' : '/login', icon: UserRound, active: ['profile', 'orders', 'inbox', 'login', 'register', 'forgot-password', 'reset-password'].includes(view.name) },
  ]

  return (
    <nav aria-label="التنقل السريع" className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(2,8,23,.08)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.slice(0, 2).map((item) => <NavItem key={item.label} {...item} />)}
        <button type="button" onClick={() => setCartOpen(true)} className="relative -mt-6 flex flex-col items-center gap-1 text-xs font-bold">
          <span className="relative grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><ShoppingCart className="size-6" />{cart.length > 0 && <span className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-white">{cart.length > 9 ? '9+' : cart.length}</span>}</span>
          <span>السلة</span>
        </button>
        {items.slice(2).map((item) => <NavItem key={item.label} {...item} />)}
      </div>
    </nav>
  )
}

function NavItem({ label, href, icon: Icon, active }: { label: string; href: string; icon: typeof Home; active: boolean }) {
  return <Link href={href} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-bold transition ${active ? 'text-primary' : 'text-muted-foreground'}`}><Icon className="size-5" /><span>{label}</span></Link>
}
