'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MAX_COMPARISON_ITEMS, toggleComparison } from '@/lib/comparison'
import { useSearchParams } from 'next/navigation'
import { useAppNavigation } from '@/lib/use-navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Package, Search, Store as StoreIcon, Filter, X, ChevronLeft, ChevronRight, RefreshCw, BadgeCheck } from 'lucide-react'
import { formatPrice } from '@/components/common'
import type { PublicPartListItem, PublicPartsList, PublicPartsQuery } from '@/lib/public-marketplace'

type Part = PublicPartListItem

export function PartsView({ initialData = null, initialQuery = {} }: { initialData?: PublicPartsList | null; initialQuery?: PublicPartsQuery }) {
  const navigate = useAppNavigation()
  const routeParams = useSearchParams()
  const [parts, setParts] = useState<Part[]>(initialData?.parts || [])
  const [categories, setCategories] = useState<string[]>(initialData?.categories || [])
  const [brands, setBrands] = useState<string[]>(initialData?.brands || [])
  const [loading, setLoading] = useState(!initialData)
  const [failed, setFailed] = useState(false)
  const [comparison, setComparison] = useState<string[]>([])
  const [retryKey, setRetryKey] = useState(0)
  const initialSearch = routeParams.get('search') || initialQuery.search || ''
  const [search, setSearch] = useState(initialSearch)
  const [appliedSearch, setAppliedSearch] = useState(initialSearch)
  const [category, setCategory] = useState(routeParams.get('category') || initialQuery.category || '')
  const [brand, setBrand] = useState(routeParams.get('brand') || initialQuery.brand || '')
  const [condition, setCondition] = useState(routeParams.get('condition') || initialQuery.condition || '')
  const [conditions, setConditions] = useState<string[]>(initialData?.conditions || [])
  const [sort, setSort] = useState(routeParams.get('sort') || initialQuery.sort || 'newest')
  const [page, setPage] = useState(Math.max(1, Number(routeParams.get('page')) || initialQuery.page || 1))
  const [totalPages, setTotalPages] = useState(initialData?.pagination.totalPages || 1)
  const [total, setTotal] = useState(initialData?.pagination.total || 0)

  const routeKey = routeParams.toString()
  useEffect(() => {
    const nextParams = new URLSearchParams(routeKey)
    const nextSearch = nextParams.get('search') || ''
    setSearch(nextSearch)
    setAppliedSearch(nextSearch)
    setCategory(nextParams.get('category') || '')
    setBrand(nextParams.get('brand') || '')
    setCondition(nextParams.get('condition') || '')
    setSort(nextParams.get('sort') || 'newest')
    setPage(Math.max(1, Number(nextParams.get('page')) || 1))
  }, [routeKey, initialQuery.brand, initialQuery.category, initialQuery.condition, initialQuery.page, initialQuery.search, initialQuery.sort])

  const buildUrl = useMemo(() => {
    const params = new URLSearchParams()
    for (const key of ['storeId', 'carModel', 'minPrice', 'maxPrice', 'inStock']) {
      const value = routeParams.get(key)
      if (value) params.set(key, value)
    }
    if (appliedSearch) params.set('search', appliedSearch)
    if (category) params.set('category', category)
    if (brand) params.set('brand', brand)
    if (condition) params.set('condition', condition)
    params.set('sort', sort)
    params.set('page', String(page))
    return params.toString()
  }, [appliedSearch, category, brand, condition, sort, page, routeParams])
  // The server renders the current URL query; hydration must not refetch it.
  const lastLoadedUrl = useRef(initialData ? buildUrl : '')
  const lastRetryKey = useRef(0)

  useEffect(() => {
    if (lastLoadedUrl.current === buildUrl && lastRetryKey.current === retryKey) return
    lastLoadedUrl.current = buildUrl
    lastRetryKey.current = retryKey
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    window.history.replaceState(window.history.state, '', `/parts?${buildUrl}`)
    fetch(`/api/parts?${buildUrl}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('parts-api-failed')
        return r.json()
      })
      .then((data: PublicPartsList) => {
        if (controller.signal.aborted) return
        setParts(data.parts || [])
        setCategories(data.categories || [])
        setBrands(data.brands || [])
        setConditions(data.conditions || [])
        setTotal(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 1)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => {
      controller.abort()
      // Strict Mode replays effects; an aborted fetch is never a loaded result.
      if (lastLoadedUrl.current === buildUrl) lastLoadedUrl.current = ''
    }
  }, [buildUrl, retryKey])

  const hasFilters = category || brand || condition || appliedSearch

  return (
    <div className="content-container space-y-7 py-10">
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">السوق</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">قطع الغيار</h1>
        <p className="text-muted-foreground mt-1">
          {loading ? 'جاري التحميل...' : `${total} قطعة غيار متوفرة`}
        </p>
        </div>
      </div>

      {/* Filters */}
      <div className="surface-panel space-y-4 p-4 md:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setAppliedSearch(search)
            setPage(1)
          }}
          className="relative w-full max-w-2xl"
        >
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            aria-label="البحث في قطع الغيار"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن قطعة، ماركة، أو وصف..."
            className="pr-9"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Filter className="size-4" />
            <span>تصفية:</span>
          </div>
          <Select value={category || 'all'} onValueChange={(v) => { setCategory(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger aria-label="تصفية حسب الفئة" className="w-40 h-9">
              <SelectValue placeholder="الفئة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={condition || 'all'} onValueChange={(v) => { setCondition(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger aria-label="تصفية حسب حالة المنتج" className="w-48 h-9">
              <SelectValue placeholder="حالة المنتج" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {conditions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={brand || 'all'} onValueChange={(v) => { setBrand(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger aria-label="تصفية حسب الماركة" className="w-40 h-9">
              <SelectValue placeholder="الماركة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الماركات</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
            <SelectTrigger aria-label="ترتيب قطع الغيار" className="w-40 h-9">
              <SelectValue placeholder="ترتيب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">الأحدث</SelectItem>
              <SelectItem value="price-asc">السعر: من الأقل</SelectItem>
              <SelectItem value="price-desc">السعر: من الأعلى</SelectItem>
              <SelectItem value="name">الاسم</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setAppliedSearch('')
                setCategory('')
                setBrand('')
                setCondition('')
                setPage(1)
              }}
              className="h-9"
            >
              <X className="size-4 ml-1" />
              مسح الفلاتر
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {comparison.length > 0 && <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-lg" role="region" aria-label="القطع المختارة للمقارنة"><p className="text-sm font-bold" role="status">{comparison.length} من {MAX_COMPARISON_ITEMS} قطع للمقارنة</p><div className="flex gap-2"><Button variant="ghost" onClick={() => setComparison([])}>مسح الاختيار</Button><Button asChild><Link href={'/compare?ids=' + encodeURIComponent(comparison.join(','))} prefetch={false}>عرض المقارنة</Link></Button></div></div>}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[1.15/1] w-full rounded-xl" />
          ))}
        </div>
      ) : failed ? (
        <Card className="border-destructive/20"><CardContent className="py-16 text-center"><RefreshCw className="mx-auto size-10 text-destructive" /><h2 className="mt-4 text-lg font-black">تعذر تحميل قطع الغيار</h2><p className="mt-2 text-sm text-muted-foreground">تحقق من اتصالك ثم حاول مرة أخرى.</p><Button variant="outline" className="mt-5" onClick={() => setRetryKey((value) => value + 1)}><RefreshCw className="ml-2 size-4" />إعادة المحاولة</Button></CardContent></Card>
      ) : parts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="size-12 mx-auto mb-3 opacity-50" />
            <p>لا توجد قطع غيار مطابقة</p>
            {hasFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setSearch('')
                  setAppliedSearch('')
                  setCategory('')
                  setBrand('')
                }}
              >
                مسح الفلاتر
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {parts.map((part) => (
            <Card
              key={part.id}
              className="market-card w-full overflow-hidden transition group h-full flex flex-col"
            >
              <button type="button" aria-label={`زيارة متجر ${part.store.name}`} className="relative block h-28 w-full overflow-hidden bg-primary/10 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" onClick={(event) => { event.stopPropagation(); navigate({ name: 'store', storeId: part.store.id }) }}>
                {part.store.image ? (
                  <Image src={part.store.image} alt="" fill sizes="(max-width: 640px) 100vw, 420px" className="object-cover transition duration-300 hover:scale-105" />
                ) : (
                  <StoreIcon className="absolute inset-0 m-auto size-10 text-primary/40" />
                )}
                <span className="absolute bottom-3 right-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full border border-card/30 bg-card/90 px-3 py-1 text-xs font-bold text-primary shadow-sm backdrop-blur">
                  <span className="truncate">{part.store.name}</span>
                  {part.store.verified && <BadgeCheck className="size-3.5 shrink-0" aria-label="متجر موثق" />}
                </span>
              </button>
              <div className="relative flex aspect-[1.15/1] items-center justify-center overflow-hidden bg-muted/25">
                {part.image ? (
                   
                  <Image
                    src={part.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    className="object-contain group-hover:scale-105 transition"
                  />
                ) : (
                  <Package className="size-16 text-muted-foreground/40" />
                )}
                {part.stock === 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    نفد
                  </span>
                )}
                {part.brand && (
                  <span className="absolute top-2 left-2 bg-card/90 backdrop-blur text-xs px-2 py-0.5 rounded-full font-medium">
                    {part.brand}
                  </span>
                )}
              </div>
              <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
                <div className="space-y-2">
                <h3 className="font-semibold line-clamp-2 text-sm leading-relaxed min-h-10">
                  {part.name}
                </h3>
                {part.category && (
                  <Badge variant="outline" className="text-xs w-fit">
                    {part.category}
                  </Badge>
                )}
                {part.condition && <Badge variant="secondary" className="text-xs">{part.condition}</Badge>}
                {(part.partNumber || part.oemNumber) && <p className="text-[11px] text-muted-foreground" dir="ltr">{part.oemNumber || part.partNumber}</p>}
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-lg font-bold text-primary">
                    {formatPrice(part.price)}
                  </span>
                  {part.stock > 0 ? (
                    <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">متوفر</span>
                  ) : (
                    <span className="text-xs text-red-500">غير متوفر</span>
                  )}
                </div>
                <Button variant="link" size="sm" className="h-auto self-start p-0" onClick={() => navigate({ name: 'part', partId: part.id })}>
                  عرض التفاصيل
                </Button>
                <Button variant={comparison.includes(part.id) ? 'secondary' : 'outline'} size="sm" className="mt-3 w-full" aria-pressed={comparison.includes(part.id)} disabled={!comparison.includes(part.id) && comparison.length >= MAX_COMPARISON_ITEMS} onClick={() => setComparison(current => toggleComparison(current, part.id))}>{comparison.includes(part.id) ? 'إزالة من المقارنة' : 'أضف للمقارنة'}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronRight className="size-4 ml-1" /> السابق
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            التالي <ChevronLeft className="size-4 mr-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
