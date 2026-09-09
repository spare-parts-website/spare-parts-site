'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

const DeferredMarketplaceSections = dynamic(
  () => import('@/components/home-marketplace-sections').then((module) => module.HomeMarketplaceSections),
  { ssr: false, loading: () => <MarketplacePlaceholder /> },
)

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

export function HomeMarketplaceSectionsLoader() {
  const [ready, setReady] = useState(false)
  const marker = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ready) return
    const element = marker.current
    const activate = () => setReady(true)
    let observer: IntersectionObserver | null = null

    if (element && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        activate()
        observer?.disconnect()
      }, { rootMargin: '700px 0px' })
      observer.observe(element)
    }

    const browser = window as IdleWindow
    let cancelIdle: () => void
    if (typeof browser.requestIdleCallback === 'function') {
      const idleId = browser.requestIdleCallback(activate, { timeout: 1800 })
      cancelIdle = () => browser.cancelIdleCallback?.(idleId)
    } else {
      const timeoutId = globalThis.setTimeout(activate, 1000)
      cancelIdle = () => globalThis.clearTimeout(timeoutId)
    }

    return () => {
      observer?.disconnect()
      cancelIdle()
    }
  }, [ready])

  return <div ref={marker}>{ready ? <DeferredMarketplaceSections /> : <MarketplacePlaceholder />}</div>
}

function MarketplacePlaceholder() {
  return (
    <>
      <section className="bg-slate-100/70 dark:bg-slate-950/35" style={{ contentVisibility: 'auto', containIntrinsicSize: '520px' }} aria-hidden="true">
        <div className="content-container section-space">
          <div className="h-7 w-44 motion-safe:animate-pulse rounded-lg bg-muted" />
          <div className="mt-4 h-40 motion-safe:animate-pulse rounded-3xl border bg-card/70" />
        </div>
      </section>
      <section className="content-container section-space" style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }} aria-hidden="true">
        <div className="h-7 w-52 motion-safe:animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 h-32 motion-safe:animate-pulse rounded-3xl border bg-card/70" />
      </section>
    </>
  )
}
