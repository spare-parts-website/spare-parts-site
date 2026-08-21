import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { AdminDashboardView } from '@/components/views/admin-dashboard-view'
import { AuthView } from '@/components/views/auth-view'
import { CartView } from '@/components/views/cart-view'
import { ChatView } from '@/components/views/chat-view'
import { CheckoutView } from '@/components/views/checkout-view'
import { InboxView } from '@/components/views/inbox-view'
import { LegalView } from '@/components/views/legal-view'
import { OrdersView } from '@/components/views/orders-view'
import { PartView } from '@/components/views/part-view'
import { PartsView } from '@/components/views/parts-view'
import { ProfileView } from '@/components/views/profile-view'
import { PasswordResetView } from '@/components/views/password-reset-view'
import { ShopDashboardView } from '@/components/views/shop-dashboard-view'
import { StoreView } from '@/components/views/store-view'
import { StoresView } from '@/components/views/stores-view'
import { WishlistView } from '@/components/views/wishlist-view'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { View } from '@/lib/store'

type RoutePageProps = {
  params: Promise<{ route: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const sellerTabs = new Set(['parts', 'orders', 'store', 'analytics', 'coupons', 'messages'])
const adminTabs = new Set(['users', 'parts', 'orders', 'reviews', 'stores', 'reports'])
const legalPages = new Set(['privacy', 'terms', 'returns', 'contact'])

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export async function generateMetadata({ params }: RoutePageProps): Promise<Metadata> {
  const { route } = await params
  const [section, id] = route

  if (['login', 'register', 'forgot-password', 'reset-password'].includes(section)) {
    const titles: Record<string, string> = { login: 'تسجيل الدخول', register: 'إنشاء حساب', 'forgot-password': 'استعادة كلمة المرور', 'reset-password': 'تعيين كلمة مرور جديدة' }
    return { title: titles[section], robots: { index: false, follow: false } }
  }

  try {
    if (section === 'parts' && id) {
      const part = await db.part.findUnique({ where: { id }, select: { name: true, description: true, image: true } })
      if (part) {
        return {
          title: part.name,
          description: part.description || `تعرف على سعر وتفاصيل ${part.name} واطلبه من غيار ماركت.`,
          openGraph: part.image ? { images: [part.image] } : undefined,
        }
      }
    }
    if (section === 'stores' && id) {
      const store = await db.store.findUnique({ where: { id }, select: { name: true, description: true, image: true } })
      if (store) {
        return {
          title: store.name,
          description: store.description || `تصفح قطع الغيار المتاحة لدى ${store.name}.`,
          openGraph: store.image ? { images: [store.image] } : undefined,
        }
      }
    }
  } catch {
    // Keep route metadata available even during temporary database interruptions.
  }

  const titles: Record<string, string> = {
    parts: 'قطع الغيار', stores: 'المتاجر', login: 'تسجيل الدخول', register: 'إنشاء حساب',
    'forgot-password': 'استعادة كلمة المرور', 'reset-password': 'تعيين كلمة مرور جديدة',
    cart: 'سلة المشتريات', checkout: 'إتمام الطلب', account: 'حسابي', seller: 'لوحة المتجر',
    admin: 'لوحة الإدارة', privacy: 'سياسة الخصوصية', terms: 'شروط الاستخدام',
    returns: 'سياسة الاسترجاع', contact: 'تواصل معنا', messages: 'الرسائل',
  }
  return { title: titles[section] || 'غيار ماركت' }
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const user = await getSession()
  const { route } = await params
  const query = await searchParams
  const [section, id, childId] = route
  const search = first(query.search)
  let view: View
  let content: React.ReactNode

  if (section === 'parts' && !id) {
    view = { name: 'parts' }
    content = <PartsView />
  } else if (section === 'parts' && id && !childId) {
    view = { name: 'part', partId: id }
    content = <PartView partId={id} />
  } else if (section === 'stores' && !id) {
    view = { name: 'stores' }
    content = <StoresView />
  } else if (section === 'stores' && id && !childId) {
    view = { name: 'store', storeId: id }
    content = <StoreView storeId={id} />
  } else if (section === 'login' && !id) {
    view = { name: 'login' }
    content = <AuthView mode="login" />
  } else if (section === 'register' && !id) {
    view = { name: 'register' }
    content = <AuthView mode="register" />
  } else if (section === 'forgot-password' && !id) {
    view = { name: 'forgot-password' }
    content = <PasswordResetView mode="request" />
  } else if (section === 'reset-password' && !id) {
    view = { name: 'reset-password' }
    content = <PasswordResetView mode="reset" token={first(query.token)} />
  } else if (section === 'cart' && !id) {
    view = { name: 'cart' }
    content = <CartView />
  } else if (section === 'checkout' && !id) {
    view = { name: 'checkout' }
    content = <CheckoutView />
  } else if (section === 'account' && id === 'profile' && !childId) {
    view = { name: 'profile' }
    content = <ProfileView />
  } else if (section === 'account' && id === 'orders' && !childId) {
    view = { name: 'orders' }
    content = <OrdersView />
  } else if (section === 'account' && id === 'wishlist' && !childId) {
    view = { name: 'wishlist' }
    content = <WishlistView />
  } else if (section === 'account' && id === 'messages' && !childId) {
    view = { name: 'inbox' }
    content = <InboxView />
  } else if (section === 'seller' && id && sellerTabs.has(id) && !childId) {
    const tab = id as Extract<View, { name: 'shop-dashboard' }>['tab']
    view = { name: 'shop-dashboard', tab }
    content = <ShopDashboardView tab={tab} />
  } else if (section === 'seller' && !id) {
    view = { name: 'shop-dashboard', tab: 'parts' }
    content = <ShopDashboardView tab="parts" />
  } else if (section === 'admin' && id && adminTabs.has(id) && !childId) {
    const tab = id as Extract<View, { name: 'admin-dashboard' }>['tab']
    view = { name: 'admin-dashboard', tab }
    content = <AdminDashboardView tab={tab} />
  } else if (section === 'admin' && !id) {
    view = { name: 'admin-dashboard', tab: 'users' }
    content = <AdminDashboardView tab="users" />
  } else if (section === 'messages' && id === 'order' && childId && route.length === 3) {
    view = { name: 'chat', orderId: childId }
    content = <ChatView orderId={childId} />
  } else if (section === 'messages' && id === 'part' && childId && route.length === 3) {
    const participantId = first(query.participant) || undefined
    view = { name: 'chat', partId: childId, participantId }
    content = <ChatView partId={childId} participantId={participantId} />
  } else if (legalPages.has(section) && !id) {
    const page = section as Extract<View, { name: 'legal' }>['page']
    view = { name: 'legal', page }
    content = <LegalView page={page} />
  } else {
    notFound()
  }

  return <AppShell initialView={view} initialSearch={search} initialUser={user}>{content}</AppShell>
}
