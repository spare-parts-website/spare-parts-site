import type { Metadata } from 'next'
import { AuthView } from '@/components/views/auth-view'

export const metadata: Metadata = {
  title: 'إنشاء حساب',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://ghyarmarket-eg.com/register' },
}

export default function RegisterPage() {
  return <AuthView mode="register" />
}
