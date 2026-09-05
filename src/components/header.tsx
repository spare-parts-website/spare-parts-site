'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/user-avatar'
import {
  Search,
  Store as StoreIcon,
  Package,
  Home,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  ShoppingBag,
  Menu,
  ShoppingCart,
  MessageSquare,
  Heart,
  UserPlus,
  LifeBuoy,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { NotificationsBell } from '@/components/notifications-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { SearchBar } from '@/components/search-bar'

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'مشتري',
  ADMIN: 'مدير النظام',
  SHOP_OWNER: 'صاحب محل',
}

export function Header() {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const cartCount = useAppStore((state) => state.cart.length)
  const setCartOpen = useAppStore((state) => state.setCartOpen)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    setSearchOpen(false)
  }, [pathname])

  const navItems = (
    <>
      <Button asChild variant={pathname === '/' ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
        <Link href="/" onClick={() => setMobileOpen(false)}><Home className="size-4" />الرئيسية</Link>
      </Button>
      <Button asChild variant={pathname === '/support' ? 'default' : 'ghost'} size="sm" className="max-xl:order-last justify-start gap-2">
        <Link href="/support" onClick={() => setMobileOpen(false)}><LifeBuoy className="size-4" />الدعم والمساعدة</Link>
      </Button>
      <Button asChild variant={pathname.startsWith('/stores') ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
        <Link href="/stores" onClick={() => setMobileOpen(false)}><StoreIcon className="size-4" />المتاجر</Link>
      </Button>
      <Button asChild variant={pathname.startsWith('/parts') ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
        <Link href="/parts" onClick={() => setMobileOpen(false)}><Package className="size-4" />قطع الغيار</Link>
      </Button>
      {user && (
        <Button asChild variant={pathname === '/account/messages' || pathname.startsWith('/messages/') ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
          <Link href="/account/messages" onClick={() => setMobileOpen(false)}><MessageSquare className="size-4" />الرسائل</Link>
        </Button>
      )}
      {(user?.role === 'BUYER' || user?.role === 'SHOP_OWNER') && (
        <Button asChild variant={pathname === '/account/orders' ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
          <Link href="/account/orders" onClick={() => setMobileOpen(false)}><ShoppingBag className="size-4" />طلباتي</Link>
        </Button>
      )}
      {(user?.role === 'BUYER' || user?.role === 'SHOP_OWNER' || user?.role === 'ADMIN') && (
        <Button asChild variant={pathname === '/account/wishlist' ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
          <Link href="/account/wishlist" onClick={() => setMobileOpen(false)}><Heart className="size-4" />المفضلة</Link>
        </Button>
      )}
      {user?.role === 'SHOP_OWNER' && (
        <Button asChild variant={pathname.startsWith('/seller') ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
          <Link href="/seller/parts" onClick={() => setMobileOpen(false)}><LayoutDashboard className="size-4" />صفحة المحل</Link>
        </Button>
      )}
      {user?.role === 'ADMIN' && (
        <Button asChild variant={pathname.startsWith('/admin') ? 'default' : 'ghost'} size="sm" className="justify-start gap-2">
          <Link href="/admin/users" onClick={() => setMobileOpen(false)}><ShieldCheck className="size-4" />لوحة المدير</Link>
        </Button>
      )}
    </>
  )

  return (
    <header className="site-header sticky top-0 z-40 w-full border-b bg-card/95 lg:bg-card/80 lg:backdrop-blur-md">
      <div className="content-container flex min-h-16 items-center gap-2 py-2">
        {/* Logo */}
        <Link
          href="/"
          aria-label="غيار ماركت - الرئيسية"
          className="group flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-primary/5"
        >
          <img
            src="/ghyar-market-logo.svg"
            alt=""
            width={72}
            height={44}
            decoding="async"
            className="h-10 w-16 object-contain transition group-hover:scale-105 sm:h-11 sm:w-[4.5rem]"
          />
          <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:inline">
            غيار ماركت
          </span>
        </Link>

        {/* Desktop Search with Autocomplete */}
        <div className="hidden min-w-0 max-w-sm flex-1 md:flex">
          <SearchBar />
        </div>

        {/* Desktop Nav */}
        <nav className="mr-1 hidden items-center gap-0.5 xl:flex">
          {navItems}
        </nav>

        <div className="flex-1 lg:flex-none" />

        {/* Cart + Theme + Notifications */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-xl md:hidden" aria-label="فتح البحث">
                <Search className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="px-4 pb-6 pt-12">
              <SheetTitle className="mb-4 text-right text-lg font-bold">البحث في قطع الغيار</SheetTitle>
              <div className="mx-auto w-full max-w-2xl"><SearchBar /></div>
            </SheetContent>
          </Sheet>
          {(!user || user.role === 'BUYER' || user.role === 'SHOP_OWNER') && (
            <Button
              variant="ghost"
              size="icon"
              className="relative size-10 rounded-xl"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="size-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
              <span className="sr-only">سلة التسوق</span>
            </Button>
          )}
          <ThemeToggle />
          {user && <NotificationsBell />}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-1">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-xl px-1.5 sm:px-2">
                  <UserAvatar name={user.name} src={user.avatar} className="size-8 text-xs" />
                  <span className="hidden sm:inline text-sm font-medium">
                    {user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
                    <span className="text-xs text-primary font-medium mt-1">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">
                  <UserIcon className="size-4 ml-2" />
                  ملفي الشخصي
                  </Link>
                </DropdownMenuItem>
                {(user.role === 'BUYER' || user.role === 'SHOP_OWNER') && (
                  <DropdownMenuItem asChild>
                    <Link href="/account/orders">
                    <ShoppingBag className="size-4 ml-2" />
                    طلباتي
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/account/messages">
                  <MessageSquare className="size-4 ml-2" />
                  الرسائل
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support">
                  <LifeBuoy className="size-4 ml-2" />
                  الدعم والمساعدة
                  </Link>
                </DropdownMenuItem>
                {user.role === 'SHOP_OWNER' && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/seller/parts">
                      <LayoutDashboard className="size-4 ml-2" />
                      صفحة المحل
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/seller/messages">
                      <MessageSquare className="size-4 ml-2" />
                      رسائل العملاء
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/users">
                    <ShieldCheck className="size-4 ml-2" />
                    لوحة المدير
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    setUser(null)
                    router.push('/')
                  }}
                >
                  <LogOut className="size-4 ml-2" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/login')}
                className="hidden sm:inline-flex"
              >
                دخول
              </Button>
              <Button
                size="sm"
                onClick={() => router.push('/register')}
                className="size-10 p-0 sm:h-9 sm:w-auto sm:px-3"
                aria-label="إنشاء حساب جديد"
              >
                <UserPlus className="size-4 sm:hidden" />
                <span className="hidden sm:inline">حساب جديد</span>
              </Button>
            </>
          )}

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 rounded-xl xl:hidden">
                <Menu className="size-5" />
                <span className="sr-only">القائمة</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="mobile-sheet-content w-[min(88vw,22rem)] gap-4 p-4 pt-16">
              <SheetTitle className="text-right text-lg font-bold">القائمة</SheetTitle>
              <div className="flex flex-col gap-1 rounded-2xl border bg-card/70 p-2">
                {navItems}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">الوضع</span>
                <ThemeToggle />
              </div>
              {!user && (
                <div className="flex flex-col gap-2 mt-auto">
                  <Button variant="outline" onClick={() => { router.push('/login'); setMobileOpen(false) }}>
                    تسجيل الدخول
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
