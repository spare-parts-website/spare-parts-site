import { warmSellerCore } from '@/lib/seller-dashboard-cache'
import { warmSellerAnalytics } from '@/components/views/analytics-view'
import { warmSellerCoupons } from '@/components/views/coupons-view'
import { warmSellerMessages } from '@/components/views/shop-messages-view'
import { warmSupportTickets } from '@/components/views/support-view'

export async function warmSellerDashboard(userId: string, currentTab?: string) {
  await Promise.allSettled([
    warmSellerCore(userId, currentTab),
    warmSellerAnalytics(userId),
    warmSellerCoupons(userId),
    warmSellerMessages(userId),
    warmSupportTickets(userId, 'SHOP_OWNER'),
  ])
}

export async function warmAdminDashboard(userId: string) {
  await warmSupportTickets(userId, 'ADMIN')
}
