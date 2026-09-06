import { warmSellerCore } from '@/lib/seller-dashboard-cache'

/**
 * Kept as a narrow intent hook for callers that explicitly know the seller is
 * entering a dashboard. Legacy fan-out helpers warmSellerAnalytics,
 * warmSellerCoupons, warmSellerMessages, and warmSupportTickets are
 * intentionally not imported or called here anymore.
 */
export async function warmSellerDashboard(userId: string, currentTab?: string) {
  await warmSellerCore(userId, currentTab)
}

export async function warmAdminDashboard(_userId: string) {
  // Admin data is fetched only after the operator opens the relevant screen.
}
