'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const DeferredMarketplaceSections = dynamic(
  () => import('@/components/home-marketplace-sections').then((module) => module.HomeMarketplaceSections),
  { ssr: false, loading: () => <MarketplacePlaceholder /> },
)

/**
 * Marketplace cards are below the hero, so loading their client bundle and JSON
 * on the very first tick only creates a thundering herd during traffic spikes.
 * A short per-browser jitter keeps first paint light and spreads the cached API
 * requests over time without making users wait meaningfully when they scroll.
 */
export function HomeMarketplaceSectionsLoader() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const delay = 500 + Math.floor(Math.random() * 900)
    const timer = window.setTimeout(() => setReady(true), delay)
    return () => window.clearTimeout(timer)
  }, [])

  return ready ? <DeferredMarketplaceSections /> : <MarketplacePlaceholder />
}

function MarketplacePlaceholder() {
  return (
    <>
      <section className="bg-slate-100/70 dark:bg-slate-950/35" style={{ contentVisibility: 'auto', containIntrinsicSize: '520px' }} aria-hidden="true">
        <div className="content-container section-space">
          <div className="h-7 w-44 animate-pulse rounded-lg bg-muted" />
          <div className="mt-4 h-40 animate-pulse rounded-3xl border bg-card/70" />
        </div>
      </section>
      <section className="content-container section-space" style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }} aria-hidden="true">
        <div className="h-7 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 h-32 animate-pulse rounded-3xl border bg-card/70" />
      </section>
    </>
  )
}
