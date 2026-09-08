/** Keep the local identity until the server confirms session revocation. */
export async function revokeCurrentSession(request: typeof fetch = fetch): Promise<void> {
  const response = await request('/api/auth/logout', { method: 'POST', cache: 'no-store' })
  if (!response.ok) throw new Error('تعذر تسجيل الخروج. حاول مرة أخرى.')
}
