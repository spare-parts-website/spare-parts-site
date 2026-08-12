'use client'

import { useAppStore, type AuthUser } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { CartDrawer } from '@/components/cart-drawer'
import { NotificationsBell } from '@/components/notifications-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { SearchBar } from '@/components/search-bar'

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'مشتري',
  ADMIN: 'مدير النظام',
  SHOP_OWNER: 'صاحب محل',
}

export function Header({ user }: { user: AuthUser | null }) {
  const { view, setView, setUser, setSearchQuery, cart, setCartOpen } = useAppStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(
    view.name === 'parts' ? useAppStore.getState().searchQuery : ''
  )

  useEffect(() => {
    if (view.name !== 'parts') {
      setSearchValue('')
    }
  }, [view.name])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchValue)
    setView({ name: 'parts' })
    setMobileOpen(false)
  }

  const navItems = (
    <>
      <Button
        variant={view.name === 'home' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => {
          setView({ name: 'home' })
          setMobileOpen(false)
        }}
        className="justify-start gap-2"
      >
        <Home className="size-4" />
        الرئيسية
      </Button>
      <Button
        variant={view.name === 'stores' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => {
          setView({ name: 'stores' })
          setMobileOpen(false)
        }}
        className="justify-start gap-2"
      >
        <StoreIcon className="size-4" />
        المتاجر
      </Button>
      <Button
        variant={view.name === 'parts' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => {
          setView({ name: 'parts' })
          setMobileOpen(false)
        }}
        className="justify-start gap-2"
      >
        <Package className="size-4" />
        قطع الغيار
      </Button>
      {user && (
        <Button
          variant={view.name === 'inbox' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            setView({ name: 'inbox' })
            setMobileOpen(false)
          }}
          className="justify-start gap-2"
        >
          <MessageSquare className="size-4" />
          الرسائل
        </Button>
      )}
      {(user?.role === 'BUYER' || user?.role === 'SHOP_OWNER') && (
        <Button
          variant={view.name === 'orders' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            setView({ name: 'orders' })
            setMobileOpen(false)
          }}
          className="justify-start gap-2"
        >
          <ShoppingBag className="size-4" />
          طلباتي
        </Button>
      )}
      {(user?.role === 'BUYER' || user?.role === 'SHOP_OWNER') && (
        <Button
          variant={view.name === 'wishlist' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            setView({ name: 'wishlist' })
            setMobileOpen(false)
          }}
          className="justify-start gap-2"
        >
          <Heart className="size-4" />
          المفضلة
        </Button>
      )}
      {user?.role === 'SHOP_OWNER' && (
        <>
          <Button
            variant={view.name === 'shop-dashboard' && (!('tab' in view) || view.tab !== 'messages') ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setView({ name: 'shop-dashboard' })
              setMobileOpen(false)
            }}
            className="justify-start gap-2"
          >
            <LayoutDashboard className="size-4" />
            لوحة المحل
          </Button>
        </>
      )}
      {user?.role === 'ADMIN' && (
        <Button
          variant={view.name === 'admin-dashboard' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            setView({ name: 'admin-dashboard' })
            setMobileOpen(false)
          }}
          className="justify-start gap-2"
        >
          <ShieldCheck className="size-4" />
          لوحة المدير
        </Button>
      )}
    </>
  )

  return (
    <header className="site-header sticky top-0 z-40 w-full border-b backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
      <div className="content-container flex min-h-16 items-center gap-2 py-2">
        {/* Logo */}
        <button
          onClick={() => setView({ name: 'home' })}
          className="group flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-primary/5"
        >
          <img
            src="/ghyar-market-logo.svg"
            alt="غيار ماركت"
            className="h-10 w-10 rounded-xl object-contain drop-shadow-sm transition group-hover:scale-105 sm:h-11 sm:w-11"
          />
          <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:inline">
            غيار ماركت
          </span>
        </button>

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
          {(!user || user.role === 'BUYER' || user.role === 'SHOP_OWNER') && (
            <Button
              variant="ghost"
              size="icon"
              className="relative size-10 rounded-xl"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="size-5" />
              {cart.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {cart.length > 9 ? '9+' : cart.length}
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
                  <Avatar className="size-8">
                    {user.avatar ? <img src={user.avatar} alt={user.name} className="aspect-square size-full object-cover" /> : <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{user.name.charAt(0)}</AvatarFallback>}
                  </Avatar>
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
                <DropdownMenuItem onClick={() => setView({ name: 'profile' })}>
                  <UserIcon className="size-4 ml-2" />
                  ملفي الشخصي
                </DropdownMenuItem>
                {(user.role === 'BUYER' || user.role === 'SHOP_OWNER') && (
                  <DropdownMenuItem onClick={() => setView({ name: 'orders' })}>
                    <ShoppingBag className="size-4 ml-2" />
                    طلباتي
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setView({ name: 'inbox' })}>
                  <MessageSquare className="size-4 ml-2" />
                  الرسائل
                </DropdownMenuItem>
                {user.role === 'SHOP_OWNER' && (
                  <>
                    <DropdownMenuItem onClick={() => setView({ name: 'shop-dashboard' })}>
                      <LayoutDashboard className="size-4 ml-2" />
                      لوحة المحل
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView({ name: 'shop-dashboard', tab: 'messages' })}>
                      <MessageSquare className="size-4 ml-2" />
                      رسائل العملاء
                    </DropdownMenuItem>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <DropdownMenuItem onClick={() => setView({ name: 'admin-dashboard' })}>
                    <ShieldCheck className="size-4 ml-2" />
                    لوحة المدير
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    setUser(null)
                    setView({ name: 'home' })
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
                onClick={() => setView({ name: 'login' })}
                className="hidden sm:inline-flex"
              >
                دخول
              </Button>
              <Button
                size="sm"
                onClick={() => setView({ name: 'register' })}
              >
                حساب جديد
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
            <SheetContent side="right" className="w-[min(88vw,22rem)] gap-4 p-4">
              <SheetTitle className="text-right text-lg font-bold">القائمة</SheetTitle>
              <div className="md:hidden">
                <SearchBar />
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border bg-card/70 p-2">
                {navItems}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">الوضع</span>
                <ThemeToggle />
              </div>
              {!user && (
                <div className="flex flex-col gap-2 mt-auto">
                  <Button variant="outline" onClick={() => { setView({ name: 'login' }); setMobileOpen(false) }}>
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
