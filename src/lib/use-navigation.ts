'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { viewToPath, type View } from '@/lib/store'

/** Programmatic navigation for actions that cannot be expressed as a Link. */
export function useAppNavigation() {
  const router = useRouter()
  return useCallback((view: View) => router.push(viewToPath(view)), [router])
}
