import type { Metadata } from 'next'
import { unstable_noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
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
import { SupportView } from '@/components/views/support-view'
import { Breadcrumbs, type BreadcrumbItem } from '@/components/breadcrumbs'
import type { View } from '@/lib/store'
import { getAnonymousPublicPart, getPublicPartsList, getAnonymousPublicStore, getPublicStoresList, type PublicPartsQuery } from '@/lib/public-marketplace'
import { schemaConditionUrl } from '@/lib/product-condition'

type RoutePageProps = { params: Promise<{ route: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export const revalidate = 30
export const dynamic = 'force-dynamic'
const sellerTabs = new Set(['parts', 'orders', 'store', 'analytics', 'coupons', 'messages'])
const adminTabs = new Set(['users', 'parts', 'orders', 'reviews', 'stores', 'reports', 'support'])
const legalPages = new Set(['privacy', 'terms', 'returns', 'contact'])
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || '' : value || '' }

export async function generateMetadata({ params }: RoutePageProps): Promise<Metadata> {
  const { route } = await params; const [section, id] = route; const siteOrigin = process.env.APP_URL || 'https://ghyarmarket-eg.com'
  const canonicalPath = section === 'parts' ? (id ? `/parts/${encodeURIComponent(id)}` : '/parts') : section === 'stores' ? (id ? `/stores/${encodeURIComponent(id)}` : '/stores') : `/${section || ''}`
  const canonical = new URL(canonicalPath || '/', siteOrigin).toString()
  if (['login', 'register', 'forgot-password', 'reset-password'].includes(section)) { const titles: Record<string, string> = { login: 'تسجيل الدخول', register: 'إنشاء حساب', 'forgot-password': 'استعادة كلمة المرور', 'reset-password': 'تعيين كلمة مرور جديدة' }; return { title: titles[section], robots: { index: false, follow: false }, alternates: { canonical } } }
  try {
    if (section === 'parts' && id) { const { part } = await getAnonymousPublicPart(id); if (part) return { title: part.name, description: part.description || `تعرف على سعر وتفاصيل ${part.name} واطلبه من غيار ماركت.`, openGraph: part.image ? { images: [part.image] } : undefined, alternates: { canonical } } }
    if (section === 'stores' && id) { const { store } = await getAnonymousPublicStore(id); if (store) return { title: store.name, description: store.description || `تصفح قطع الغيار المتاحة لدى ${store.name}.`, openGraph: store.image ? { images: [store.image] } : undefined, alternates: { canonical } } }
  } catch {}
  const titles: Record<string, string> = { parts: 'قطع الغيار', stores: 'المتاجر', login: 'تسجيل الدخول', register: 'إنشاء حساب', 'forgot-password': 'استعادة كلمة المرور', 'reset-password': 'تعيين كلمة مرور جديدة', cart: 'سلة المشتريات', checkout: 'إتمام الطلب', account: 'حسابي', seller: 'لوحة المتجر', admin: 'لوحة الإدارة', privacy: 'سياسة الخصوصية', terms: 'شروط الاستخدام', returns: 'سياسة الاسترجاع', contact: 'تواصل معنا', messages: 'الرسائل', support: 'الدعم والمساعدة' }
  const privateSection = ['account', 'seller', 'admin', 'cart', 'checkout', 'messages', 'support'].includes(section)
  return { title: titles[section] || 'غيار ماركت', alternates: { canonical }, ...(privateSection ? { robots: { index: false, follow: false } } : {}) }
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const nonce = (await headers()).get('x-nonce') || undefined; const { route } = await params; const query = await searchParams; const [section, id, childId] = route; const search = first(query.search)
  if (['account', 'seller', 'admin', 'cart', 'checkout', 'messages', 'support'].includes(section)) unstable_noStore()
  let view: View; let content: React.ReactNode; let structuredData: Record<string, unknown> | null = null; let breadcrumbItems: BreadcrumbItem[] = []
  if (section === 'parts' && !id) {
    view = { name: 'parts' }; const requestedPage = Number.parseInt(first(query.page) || '1', 10); const initialQuery: PublicPartsQuery = { search, category: first(query.category), brand: first(query.brand), condition: first(query.condition), storeId: first(query.storeId), minPrice: first(query.minPrice), maxPrice: first(query.maxPrice), carModel: first(query.carModel), sort: first(query.sort) || 'newest', page: Number.isFinite(requestedPage) ? requestedPage : 1 }; const initialData = await getPublicPartsList(initialQuery); content = <PartsView initialData={initialData} initialQuery={initialQuery} />
  } else if (section === 'parts' && id && !childId) {
    view = { name: 'part', partId: id }; const { part, canReview } = await getAnonymousPublicPart(id); if (!part) notFound(); content = <PartView partId={id} initialPart={part} initialCanReview={canReview} />; if (part) { breadcrumbItems = [{ label: 'الرئيسية', href: '/' }, { label: 'قطع الغيار', href: '/parts' }, { label: part.name }]; structuredData = { '@context': 'https://schema.org', '@type': 'Product', name: part.name, description: part.description || undefined, image: part.image ? [part.image] : undefined, brand: part.brand ? { '@type': 'Brand', name: part.brand } : undefined, itemCondition: schemaConditionUrl(part.condition), offers: { '@type': 'Offer', priceCurrency: 'EGP', price: part.price, availability: part.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: part.store.name } } } }
  } else if (section === 'stores' && !id) {
    view = { name: 'stores' }; const requestedPage = Number.parseInt(first(query.page) || '1', 10); const initialPage = Number.isFinite(requestedPage) ? requestedPage : 1; const initialData = await getPublicStoresList(search, initialPage); content = <StoresView initialData={initialData} initialSearch={search} initialPage={initialPage} />
  } else if (section === 'stores' && id && !childId) {
    view = { name: 'store', storeId: id }; const { store, canReview } = await getAnonymousPublicStore(id); if (!store) notFound(); content = <StoreView storeId={id} initialStore={store} initialCanReview={canReview} />; if (store) { breadcrumbItems = [{ label: 'الرئيسية', href: '/' }, { label: 'المتاجر', href: '/stores' }, { label: store.name }]; structuredData = { '@context': 'https://schema.org', '@type': 'AutoPartsStore', name: store.name, description: store.description || undefined, image: store.image || undefined, address: store.address || undefined, telephone: store.phone || undefined, url: `${process.env.APP_URL || 'https://ghyarmarket-eg.com'}/stores/${id}` } }
  } else if (section === 'login' && !id) { view = { name: 'login' }; content = <AuthView mode="login" /> }
  else if (section === 'register' && !id) { view = { name: 'register' }; content = <AuthView mode="register" /> }
  else if (section === 'forgot-password' && !id) { view = { name: 'forgot-password' }; content = <PasswordResetView mode="request" /> }
  else if (section === 'reset-password' && !id) { view = { name: 'reset-password' }; content = <PasswordResetView mode="reset" token={first(query.token)} /> }
  else if (section === 'cart' && !id) { view = { name: 'cart' }; content = <CartView /> }
  else if (section === 'checkout' && !id) { view = { name: 'checkout' }; content = <CheckoutView /> }
  else if (section === 'account' && id === 'profile' && !childId) { view = { name: 'profile' }; content = <ProfileView /> }
  else if (section === 'account' && id === 'orders' && !childId) { view = { name: 'orders' }; content = <OrdersView /> }
  else if (section === 'account' && id === 'wishlist' && !childId) { view = { name: 'wishlist' }; content = <WishlistView /> }
  else if (section === 'account' && id === 'messages' && !childId) { view = { name: 'inbox' }; content = <InboxView /> }
  else if (section === 'support' && !id) { view = { name: 'support' }; content = <SupportView /> }
  else if (section === 'seller' && id && sellerTabs.has(id) && !childId) { const tab = id as Extract<View, { name: 'shop-dashboard' }>['tab']; view = { name: 'shop-dashboard', tab }; content = <ShopDashboardView tab={tab} /> }
  else if (section === 'seller' && !id) { view = { name: 'shop-dashboard', tab: 'parts' }; content = <ShopDashboardView tab="parts" /> }
  else if (section === 'admin' && id && adminTabs.has(id) && !childId) { const tab = id as Extract<View, { name: 'admin-dashboard' }>['tab']; view = { name: 'admin-dashboard', tab }; content = <AdminDashboardView tab={tab} /> }
  else if (section === 'admin' && !id) { view = { name: 'admin-dashboard', tab: 'users' }; content = <AdminDashboardView tab="users" /> }
  else if (section === 'messages' && id === 'order' && childId && route.length === 3) { view = { name: 'chat', orderId: childId }; content = <ChatView orderId={childId} /> }
  else if (section === 'messages' && id === 'part' && childId && route.length === 3) { const participantId = first(query.participant) || undefined; view = { name: 'chat', partId: childId, participantId }; content = <ChatView partId={childId} participantId={participantId} /> }
  else if (legalPages.has(section) && !id) { const page = section as Extract<View, { name: 'legal' }>['page']; view = { name: 'legal', page }; content = <LegalView page={page} /> }
  else notFound()
  void view
  return <>{structuredData && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />}{breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} nonce={nonce} />}{content}</>
}
