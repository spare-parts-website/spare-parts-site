import { notFound } from 'next/navigation'
import { AdminDashboardView } from '@/components/views/admin-dashboard-view'

const sections = ['users', 'parts', 'orders', 'reviews', 'stores', 'reports', 'support'] as const
export default async function AdminPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const selected = sections.find(value => value === section)
  if (!selected) notFound()
  return <AdminDashboardView tab={selected} />
}
