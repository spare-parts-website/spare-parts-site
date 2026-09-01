'use client'

import Link from 'next/link'
import { Heart, Home, LifeBuoy, PackageSearch, ShoppingCart, Store as StoreIcon, UserRound } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'

export function MobileBottomNav() {
  const pathname = usePathname() || '/'
  const cartCount = useAppStore((state) => state.cart.length)
  const user = useAppStore((state) => state.user)
  const setCartOpen = useAppStore((state) => state.setCartOpen)
  const items = [
    { label: 'الرئيسية', href: '/', icon: Home, active: pathname === '/' },
    { label: 'القطع', href: '/parts', icon: PackageSearch, active: pathname.startsWith('/parts') },
    { label: 'الدعم', href: '/support', icon: LifeBuoy, active: pathname === '/support' },
    user?.role === 'SHOP_OWNER'
      ? { label: 'صفحة المحل', href: '/seller/parts', icon: StoreIcon, active: pathname.startsWith('/seller') }
      : { label: 'المفضلة', href: user ? '/account/wishlist' : '/login', icon: Heart, active: pathname === '/account/wishlist' },
    { label: 'حسابي', href: user ? '/account/profile' : '/login', icon: UserRound, active: ['/account/profile', '/account/orders', '/account/messages', '/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) || pathname.startsWith('/messages/') },
  ]

  return (
    <nav aria-label="التنقل السريع" className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(2,8,23,.08)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {items.slice(0, 2).map((item) => <NavItem key={item.label} {...item} />)}
        <button type="button" onClick={() => setCartOpen(true)} className="relative -mt-6 flex flex-col items-center gap-1 text-xs font-bold">
          <span className="relative grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><ShoppingCart className="size-6" />{cartCount > 0 && <span className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-white">{cartCount > 9 ? '9+' : cartCount}</span>}</span>
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
