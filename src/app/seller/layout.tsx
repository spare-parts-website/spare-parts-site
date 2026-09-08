import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'إدارة متجري', robots: { index: false, follow: false } }
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'SHOP_OWNER') redirect('/account/profile')
  return children
}
