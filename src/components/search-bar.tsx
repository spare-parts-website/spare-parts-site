'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Package, Store as StoreIcon, Car } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  parts: any[]
  stores: any[]
  carModels: string[]
}

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults(null)
      setOpen(false)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const debounce = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error('SEARCH_FAILED')
        setResults(data)
        setOpen(true)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResults(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(debounce)
      controller.abort()
    }
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/parts?search=${encodeURIComponent(query.trim())}`)
      setOpen(false)
    }
  }

  const hasResults =
    results && ((results.parts?.length || 0) + (results.stores?.length || 0) + (results.carModels?.length || 0)) > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results && setOpen(true)}
            placeholder="ابحث عن قطع، متاجر، سيارات..."
            className="w-full pr-9 pl-4 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {loading && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
      </form>

      {open && results && (
        <div className="absolute top-full mt-2 w-full bg-card border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto scrollbar-thin">
          {!hasResults && !loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد نتائج لـ "{query}"
            </div>
          )}

          {results.parts.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">قطع الغيار</div>
              {results.parts.slice(0, 5).map((part) => (
                <button
                  key={part.id}
                  className="w-full text-right p-2 hover:bg-muted/50 rounded flex items-center gap-3 transition"
                  onClick={() => {
                    router.push(`/parts/${encodeURIComponent(part.id)}`)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <div className="relative size-10 rounded bg-muted/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {part.image ? (
                      <Image src={part.image} alt={part.name} fill sizes="40px" className="object-contain" />
                    ) : (
                      <Package className="size-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{part.name}</p>
                    <p className="text-xs text-muted-foreground">{part.store.name}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary shrink-0">
                    {part.price.toLocaleString('ar-EG')} ج.م
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.stores.length > 0 && (
            <div className="p-2 border-t">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">المتاجر</div>
              {results.stores.map((store) => (
                <button
                  key={store.id}
                  className="w-full text-right p-2 hover:bg-muted/50 rounded flex items-center gap-3 transition"
                  onClick={() => {
                    router.push(`/stores/${encodeURIComponent(store.id)}`)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <div className="size-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <StoreIcon className="size-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{store.name}</p>
                    {store.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{store.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.carModels.length > 0 && (
            <div className="p-2 border-t">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">سيارات</div>
              {results.carModels.map((model) => (
                <button
                  key={model}
                  className="w-full text-right p-2 hover:bg-muted/50 rounded flex items-center gap-3 transition"
                  onClick={() => {
                    router.push(`/parts?search=${encodeURIComponent(model)}`)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <div className="size-10 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Car className="size-5 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium">{model}</span>
                </button>
              ))}
            </div>
          )}

          {hasResults && (
            <button
              className="w-full text-center p-3 border-t text-sm text-primary hover:bg-primary/5 transition"
              onClick={handleSubmit}
            >
              عرض كل النتائج لـ "{query}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
