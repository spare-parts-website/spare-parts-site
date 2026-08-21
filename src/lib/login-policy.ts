export function requiresLoginCode(role: string) {
  return role !== 'ADMIN'
}
