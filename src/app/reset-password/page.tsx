import type { Metadata } from 'next'
import { PasswordResetView } from '@/components/views/password-reset-view'

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>
}

export const metadata: Metadata = {
  title: 'تعيين كلمة مرور جديدة',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://ghyarmarket-eg.com/reset-password' },
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const query = await searchParams
  const token = Array.isArray(query.token) ? query.token[0] || '' : query.token || ''
  return <PasswordResetView mode="reset" token={token} />
}
