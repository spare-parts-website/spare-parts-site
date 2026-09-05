import type { Metadata } from 'next'
import { PasswordResetView } from '@/components/views/password-reset-view'

export const metadata: Metadata = {
  title: 'استعادة كلمة المرور',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://ghyarmarket-eg.com/forgot-password' },
}

export default function ForgotPasswordPage() {
  return <PasswordResetView mode="request" />
}
