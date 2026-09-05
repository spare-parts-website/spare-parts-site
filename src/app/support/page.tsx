import type { Metadata } from 'next'
import { SupportView } from '@/components/views/support-view'

export const metadata: Metadata = {
  title: 'الدعم والمساعدة',
  description: 'تواصل مع فريق دعم غيار ماركت وتابع تذاكر المساعدة من حسابك.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://ghyarmarket-eg.com/support' },
}

export default function SupportPage() {
  return <SupportView />
}
