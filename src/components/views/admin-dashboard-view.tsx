'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, Package, ShoppingBag, Star, Store as StoreIcon, Flag, Mail } from 'lucide-react'
import { AdminListView } from '@/components/views/admin-list-view'
import { AdminReviewsView } from '@/components/views/admin-reviews-view'
import { ModerationCenter } from '@/components/moderation-center'
import { SupportView } from '@/components/views/support-view'

export type AdminTab = 'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports' | 'support'
const tabs: Array<{ value: AdminTab; label: string; icon: typeof Users }> = [
  { value: 'users', label: 'المستخدمون', icon: Users },
  { value: 'stores', label: 'المتاجر', icon: StoreIcon },
  { value: 'parts', label: 'القطع', icon: Package },
  { value: 'orders', label: 'الطلبات', icon: ShoppingBag },
  { value: 'reviews', label: 'التقييمات', icon: Star },
  { value: 'reports', label: 'المراجعة', icon: Flag },
  { value: 'support', label: 'الدعم', icon: Mail },
]

export function AdminDashboardView({ tab: initialTab = 'users' }: { tab?: AdminTab }) {
  const router = useRouter()
  const pathname = usePathname() || '/admin/users'
  const routeTab = pathname.split('/')[2] as AdminTab | undefined
  const tab = tabs.some((item) => item.value === routeTab) ? routeTab! : initialTab

  return <div className="content-container dashboard-shell min-w-0 space-y-7 py-10">
    <div className="page-heading mb-0"><div><p className="page-kicker">إدارة المنصة</p><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">لوحة تحكم المدير</h1><p className="mt-1 text-muted-foreground">قوائم متدرجة، تفاصيل عند الطلب، ومراجعة آمنة للعمليات الحساسة</p></div></div>
    <Tabs value={tab} onValueChange={(value) => router.push(`/admin/${value}`)}>
      <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/70 p-1 sm:grid-cols-4 lg:grid-cols-7">
        {tabs.map((item) => <TabsTrigger key={item.value} value={item.value} className="gap-1 text-[11px] sm:text-sm"><item.icon className="size-4" /><span>{item.label}</span></TabsTrigger>)}
      </TabsList>
      {(['users','stores','parts','orders'] as const).map((value) => <TabsContent key={value} value={value} className="mt-5"><AdminListView tab={value} /></TabsContent>)}
      <TabsContent value="reviews" className="mt-5"><AdminReviewsView /></TabsContent>
      <TabsContent value="reports" className="mt-5 space-y-6"><ModerationCenter /><AdminListView tab="reports" /></TabsContent>
      <TabsContent value="support" className="mt-5"><SupportView embedded /></TabsContent>
    </Tabs>
  </div>
}
