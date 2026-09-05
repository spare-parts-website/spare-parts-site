'use client'

import { useEffect } from 'react'

export function PwaInstaller() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return

    let cancelled = false
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const register = () => {
      if (!cancelled) void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    const schedule = () => {
      if (typeof idleWindow.requestIdleCallback === 'function') {
        return { kind: 'idle' as const, handle: idleWindow.requestIdleCallback(register, { timeout: 4000 }) }
      }
      return { kind: 'timeout' as const, handle: window.setTimeout(register, 3000) }
    }

    let scheduled: ReturnType<typeof schedule> | null = null
    const onLoad = () => { scheduled = schedule() }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', onLoad)
      if (!scheduled) return
      if (scheduled.kind === 'idle' && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(scheduled.handle)
      else window.clearTimeout(scheduled.handle)
    }
  }, [])

  return null
}
