import type { Metadata } from 'next'
import { SellerOrdersView } from '@/components/views/seller-orders-view'

export const metadata: Metadata = {
  title: 'طلبات المتجر',
  robots: { index: false, follow: false },
}

export default function SellerOrdersPage() {
  return <SellerOrdersView />
}
