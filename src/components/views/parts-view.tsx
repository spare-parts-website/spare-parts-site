'use client'

import { useEffect, useState, useMemo } from 'react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Package, Search, Store as StoreIcon, Filter, X, Car, Check, ChevronLeft, ChevronRight } from 'lucide-react'
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
  store: { id: string; name: string }
}

export function PartsView() {
  const { setView, searchQuery } = useAppStore()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [carBrands, setCarBrands] = useState<{ brand: string; models: string[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchQuery)
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [carModel, setCarModel] = useState('')
  const [carPopoverOpen, setCarPopoverOpen] = useState(false)
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setSearch(searchQuery)
    setPage(1)
  }, [searchQuery])

  // Fetch car models once
  useEffect(() => {
    fetch('/api/car-models', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCarBrands(data.grouped || []))
      .catch(() => {})
  }, [])

  const buildUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (category) params.set('category', category)
    if (brand) params.set('brand', brand)
    if (carModel) params.set('carModel', carModel)
    params.set('sort', sort)
    params.set('page', String(page))
    return params.toString()
  }, [search, category, brand, carModel, sort, page])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/parts?${buildUrl}`, { cache: 'no-store' })
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

  const hasFilters = category || brand || search || carModel

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">قطع الغيار</h1>
        <p className="text-muted-foreground mt-1">
          {loading ? 'جاري التحميل...' : `${total} قطعة غيار متوفرة`}
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            useAppStore.setState({ searchQuery: search })
          }}
          className="relative max-w-xl"
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

          {/* Car model filter */}
          <Popover open={carPopoverOpen} onOpenChange={setCarPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={carModel ? 'default' : 'outline'}
                size="sm"
                className="h-9 gap-1.5"
              >
                <Car className="size-4" />
                {carModel || 'سيارتي'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-3 border-b">
                <h4 className="font-medium text-sm">اختر سيارتك</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  عرض القطع المتوافقة مع سيارتك فقط
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                <button
                  className="w-full text-right px-3 py-2 hover:bg-muted/50 transition flex items-center justify-between text-sm"
                          onClick={() => {
                            setCarModel('')
                            setPage(1)
                    setCarPopoverOpen(false)
                  }}
                >
                  <span>كل السيارات</span>
                  {!carModel && <Check className="size-4 text-primary" />}
                </button>
                {carBrands.map((group) => (
                  <div key={group.brand}>
                    <div className="px-3 py-1.5 bg-muted/30 text-xs font-semibold text-muted-foreground sticky top-0">
                      {group.brand}
                    </div>
                    {group.models.map((m) => (
                      <button
                        key={m}
                        className="w-full text-right px-3 py-2 hover:bg-muted/50 transition flex items-center justify-between text-sm"
                          onClick={() => {
                            setCarModel(m)
                            setPage(1)
                          setCarPopoverOpen(false)
                        }}
                      >
                        <span>{m}</span>
                        {carModel === m && <Check className="size-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              {carModel && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setCarModel('')
                      setPage(1)
                      setCarPopoverOpen(false)
                    }}
                  >
                    <X className="size-4 ml-1" />
                    مسح اختيار السيارة
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setCategory('')
                setBrand('')
                setCarModel('')
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
              className="w-full max-w-sm overflow-hidden cursor-pointer hover:shadow-md transition group h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setView({ name: 'part', partId: part.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setView({ name: 'part', partId: part.id })
                }
              }}
            >
              <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                {part.image ? (
                   
                  <img
                    src={part.image}
                    alt={part.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition"
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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StoreIcon className="size-3" />
                  <button
                    className="truncate hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setView({ name: 'store', storeId: part.store.id })
                    }}
                  >
                    {part.store.name}
                  </button>
                </div>
                <h3 className="font-semibold line-clamp-2 text-sm leading-relaxed min-h-10 flex-1">
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
