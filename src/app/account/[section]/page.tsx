import { notFound } from 'next/navigation'
import { OrdersView } from '@/components/views/orders-view'
import { ProfileView } from '@/components/views/profile-view'
import { WishlistView } from '@/components/views/wishlist-view'
import { InboxView } from '@/components/views/inbox-view'

export default async function AccountPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  switch (section) {
    case 'orders': return <OrdersView />
    case 'profile': return <ProfileView />
    case 'wishlist': return <WishlistView />
    case 'messages': return <InboxView />
    default: notFound()
  }
}
