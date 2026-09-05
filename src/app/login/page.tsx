import type { Metadata } from 'next'
import { AuthView } from '@/components/views/auth-view'

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://ghyarmarket-eg.com/login' },
}

export default function LoginPage() {
  return <AuthView mode="login" />
}
