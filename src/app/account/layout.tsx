import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'حسابي', robots: { index: false, follow: false } }
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const links = [['/account/orders', 'طلباتي'], ['/account/profile', 'بياناتي'], ['/account/wishlist', 'المفضلة'], ['/account/messages', 'الرسائل'], ['/account/security', 'الأمان'], ['/support', 'الدعم']]
  return <><nav aria-label="التنقل في حسابي" className="border-b bg-card"><div className="content-container flex flex-wrap gap-2 py-3">{links.map(([href, label]) => <Link key={href} href={href} prefetch={false} className="rounded-lg px-4 py-2 text-sm font-bold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{label}</Link>)}</div></nav>{children}</>
}
