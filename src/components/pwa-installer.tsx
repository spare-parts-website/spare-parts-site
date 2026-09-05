'use client'
import { useEffect } from 'react'

export function PwaInstaller() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return

    let cancelled = false
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null

    const register = () => {
      if (cancelled) return
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }

    const schedule = () => {
      const idleWindow = window as typeof window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(register, { timeout: 4000 })
      } else {
        timeoutHandle = window.setTimeout(register, 2500)
      }
    }

    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      const idleWindow = window as typeof window & { cancelIdleCallback?: (handle: number) => void }
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleHandle)
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle)
    }
  }, [])
  return null
}
