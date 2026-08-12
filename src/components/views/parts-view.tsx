'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
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
import { Package, Search, Store as StoreIcon, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatPrice } from '@/components/common'

interface Part {
  id: string
  name: string
  description?: string | null
  price: number
  stock: number
  category?: string | null
  brand?: string | null
  image?: string | null
  carModels?: string | null
  store: { id: string; name: string; image?: string | null; owner: { name: string; avatar?: string | null } }
}

export function PartsView() {
  const { setView, searchQuery } = useAppStore()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchQuery)
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setSearch(searchQuery)
    setPage(1)
  }, [searchQuery])

  const buildUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (category) params.set('category', category)
    if (brand) params.set('brand', brand)
    params.set('sort', sort)
    params.set('page', String(page))
    return params.toString()
  }, [search, category, brand, sort, page])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/parts?${buildUrl}`)
      .then((r) => r.json())
      .then((data) => {
        setParts(data.parts || [])
        setCategories(data.categories || [])
        setBrands(data.brands || [])
        setTotal(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 1)
      })
      .finally(() => setLoading(false))
  }, [buildUrl])

  const hasFilters = category || brand || search

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
            useAppStore.setState({ searchQuery: search })
          }}
          className="relative w-full max-w-2xl"
        >
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
            <SelectTrigger className="w-40 h-9">
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

          <Select value={brand || 'all'} onValueChange={(v) => { setBrand(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-40 h-9">
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
            <SelectTrigger className="w-40 h-9">
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
                setCategory('')
                setBrand('')
                setPage(1)
                useAppStore.setState({ searchQuery: '' })
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
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
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
              role="link"
              tabIndex={0}
              aria-label={`عرض تفاصيل ${part.name}`}
              className="market-card w-full overflow-hidden cursor-pointer transition group h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setView({ name: 'part', partId: part.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setView({ name: 'part', partId: part.id })
                }
              }}
            >
              <div className="relative flex aspect-[1.15/1] items-center justify-center overflow-hidden bg-muted/25">
                {part.image ? (
                   
                  <Image
                    src={part.image}
                    alt={part.name}
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
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-lg font-bold text-primary">
                    {formatPrice(part.price)}
                  </span>
                  {part.stock > 0 ? (
                    <span className="text-xs text-emerald-600">متوفر</span>
                  ) : (
                    <span className="text-xs text-red-500">غير متوفر</span>
                  )}
                </div>
                <Button variant="link" size="sm" className="h-auto self-start p-0" onClick={(event) => { event.stopPropagation(); setView({ name: 'part', partId: part.id }) }}>
                  عرض التفاصيل
                </Button>
                </div>
                <div className="flex items-stretch gap-3 border-t border-border/60 pt-3">
                  <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-primary/20 bg-primary/5">
                    {part.store.image ? (
                      <Image src={part.store.image} alt={part.store.name} fill sizes="128px" quality={90} className="object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <StoreIcon className="absolute inset-0 m-auto size-8 text-primary/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-right">
                    <button type="button" className="flex w-full items-center justify-end gap-1 text-sm font-bold text-primary hover:underline" onClick={(event) => { event.stopPropagation(); setView({ name: 'store', storeId: part.store.id }) }}>
                      <StoreIcon className="size-4 shrink-0" />
                      <span className="truncate">{part.store.name}</span>
                    </button>
                    <p className="truncate text-xs text-muted-foreground">البائع: {part.store.owner.name}</p>
                  </div>
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
