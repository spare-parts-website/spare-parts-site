export function requiresLoginCode(role: string) {
  // Buyer/seller sign-ins use a fresh email code. Admins use the stronger TOTP/recovery flow.
  return role === 'BUYER' || role === 'SHOP_OWNER'
}
