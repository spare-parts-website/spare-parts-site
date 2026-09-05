'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Store as StoreIcon, Package, Search, MapPin, Phone, ShieldCheck, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Stars } from '@/components/common'
import { FavoriteStoreButton } from '@/components/favorite-store-button'
import type { PublicStoreListItem, PublicStoresList } from '@/lib/public-marketplace'

type Store = PublicStoreListItem

export function StoresView({ initialData = null, initialSearch = '', initialPage = 1 }: { initialData?: PublicStoresList | null; initialSearch?: string; initialPage?: number }) {
  const navigate = useAppNavigation()
  const routeParams = useSearchParams()
  const routeSearch = routeParams.get('search') || initialSearch
  const routePage = Math.max(1, Number(routeParams.get('page')) || initialPage)
  const hasRouteParams = Boolean(routeParams.toString())
  const [stores, setStores] = useState<Store[]>(initialData?.stores || [])
  const [loading, setLoading] = useState(!initialData)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState(routeSearch)
  const [page, setPage] = useState(initialData?.pagination.page || routePage)
  const [totalPages, setTotalPages] = useState(initialData?.pagination.totalPages || 1)
  const [total, setTotal] = useState(initialData?.pagination.total || 0)

  const load = (q: string, requestedPage = 1) => {
    setLoading(true)
    setFailed(false)
    const params = new URLSearchParams()
    if (q) params.set('search', q)
    params.set('page', String(requestedPage))
    window.history.replaceState(window.history.state, '', `/stores?${params.toString()}`)
    fetch(`/api/stores?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('stores-api-failed')
        return r.json()
      })
      .then((data: PublicStoresList) => {
        setStores(data.stores || [])
        setPage(data.pagination?.page || requestedPage)
        setTotalPages(data.pagination?.totalPages || 1)
        setTotal(data.pagination?.total || 0)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // The static list payload is unfiltered. Query-string searches and pages
    // must fetch their own public API response after hydration.
    if (initialData && !hasRouteParams) return
    let cancelled = false
    const params = new URLSearchParams()
    if (routeSearch) params.set('search', routeSearch)
    params.set('page', String(routePage))
    fetch(`/api/stores?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('stores-api-failed')
        return r.json()
      })
      .then((data: PublicStoresList) => {
        if (!cancelled) {
          setStores(data.stores || [])
          setPage(data.pagination?.page || routePage)
          setTotalPages(data.pagination?.totalPages || 1)
          setTotal(data.pagination?.total || 0)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [initialData, initialPage, initialSearch, routePage, routeSearch, hasRouteParams])

  return (
    <div className="content-container space-y-7 py-10">
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">البائعون</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">المتاجر</h1>
        <p className="text-muted-foreground mt-1">
          {loading ? 'جاري التحميل...' : `${total} متجر لديه قطع معروضة`}
        </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          load(search, 1)
        }}
        className="surface-panel relative max-w-2xl p-2"
      >
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          aria-label="البحث عن متجر"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن متجر..."
          className="pr-9"
        />
      </form>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 justify-items-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : failed ? (
        <Card className="border-destructive/20"><CardContent className="py-16 text-center"><RefreshCw className="mx-auto size-10 text-destructive" /><h2 className="mt-4 text-lg font-black">تعذر تحميل المتاجر</h2><p className="mt-2 text-sm text-muted-foreground">تحقق من اتصالك ثم حاول مرة أخرى.</p><Button variant="outline" className="mt-5" onClick={() => load(search, page)}><RefreshCw className="ml-2 size-4" />إعادة المحاولة</Button></CardContent></Card>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <StoreIcon className="size-12 mx-auto mb-3 opacity-50" />
            <p>لا توجد متاجر لديها قطع مطابقة حالياً</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Card
              key={store.id}
              className="market-card w-full transition group"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="relative size-24 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                    {store.image ? <Image src={store.image} alt="" fill sizes="160px" className="object-cover" /> : <StoreIcon className="size-7" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-base line-clamp-1 group-hover:text-primary transition">{store.name}</CardTitle>
                      {store.verified && <ShieldCheck className="size-4 text-emerald-500 shrink-0" aria-label="متجر موثق" />}
                      <div className="mr-auto" onClick={(event) => event.stopPropagation()}>
                        <FavoriteStoreButton storeId={store.id} />
                      </div>
                    </div>
                    {store.reviewCount > 0 ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Stars value={store.avgRating} />
                        <span className="text-xs text-muted-foreground">({store.reviewCount} تقييم)</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">لا توجد تقييمات بعد</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {store.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {store.description}
                  </p>
                )}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {store.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      <span className="line-clamp-1">{store.address}</span>
                    </div>
                  )}
                  {store.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="size-3.5" />
                      <span dir="ltr">{store.phone}</span>
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Package className="size-3 ml-1" />
                  {store._count.parts} قطعة غيار
                </Badge>
                {store.completedOrderCount > 0 && <p className="text-xs text-muted-foreground">{store.completedOrderCount} طلباً مكتملًا</p>}
                {store.completionRate !== null && <Badge variant="outline" className="text-[10px]">نسبة الإكمال {store.completionRate}%</Badge>}
                <Button variant="link" size="sm" className="h-auto p-0" onClick={(event) => { event.stopPropagation(); navigate({ name: 'store', storeId: store.id }) }}>
                  زيارة المتجر
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(search, Math.max(1, page - 1))}>
            <ChevronRight className="size-4 ml-1" /> السابق
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => load(search, Math.min(totalPages, page + 1))}>
            التالي <ChevronLeft className="size-4 mr-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
