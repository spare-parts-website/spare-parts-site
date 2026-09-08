import { notFound } from 'next/navigation'
import { ShopDashboardView } from '@/components/views/shop-dashboard-view'

const sections = ['parts', 'store', 'analytics', 'coupons', 'messages'] as const
export default async function SellerPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const selected = sections.find(value => value === section)
  if (!selected) notFound()
  return <ShopDashboardView tab={selected} />
}
