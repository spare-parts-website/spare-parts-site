'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Car, Plus, Trash2, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { subscribeAIDraft } from '@/lib/ai/draft-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface UserCar {
  id: string
  brand: string
  model: string
  generation?: string | null
  year?: number | null
  nickname?: string | null
  engine?: string | null
  trim?: string | null
  isPrimary: boolean
  createdAt: string
}

const POPULAR_BRANDS = ['Toyota', 'Hyundai', 'Nissan', 'Kia', 'Honda', 'Mercedes', 'BMW', 'VW', 'Chevrolet', 'Mitsubishi']

export function MyCarsView() {
  const router = useRouter()
  const { user, setView, setSearchQuery } = useAppStore()
  const { toast } = useToast()
  const [cars, setCars] = useState<UserCar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ brand: '', model: '', generation: '', year: '', engine: '', trim: '', nickname: '', isPrimary: false })
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    fetch('/api/user-cars', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCars(data.cars || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user && ['BUYER', 'SHOP_OWNER'].includes(user.role)) {
      load()
      return subscribeAIDraft('car', (draft) => {
        setForm((current) => ({ ...current, brand: typeof draft.brand === 'string' ? draft.brand : current.brand, model: typeof draft.model === 'string' ? draft.model : current.model, generation: typeof draft.generation === 'string' ? draft.generation : current.generation, year: draft.year === undefined ? current.year : String(draft.year), engine: typeof draft.engine === 'string' ? draft.engine : current.engine, trim: typeof draft.trim === 'string' ? draft.trim : current.trim, nickname: typeof draft.nickname === 'string' ? draft.nickname : current.nickname, isPrimary: typeof draft.isPrimary === 'boolean' ? draft.isPrimary : current.isPrimary }))
        setShowForm(true)
      })
    }
  }, [user])

  const handleAdd = async () => {
    if (!form.brand || !form.model) {
      toast({ title: 'خطأ', description: 'الماركة والموديل مطلوبان', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/user-cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تمت الإضافة', description: 'تم حفظ سيارتك' })
      setForm({ brand: '', model: '', generation: '', year: '', engine: '', trim: '', nickname: '', isPrimary: false })
      setShowForm(false)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/user-cars?id=${id}`, { method: 'DELETE' })
    setCars((prev) => prev.filter((c) => c.id !== id))
    toast({ title: 'تم الحذف' })
  }

  const handleSearchParts = (car: UserCar) => {
    setSearchQuery('')
    router.push(`/parts?carId=${encodeURIComponent(car.id)}`)
  }

  const makePrimary = async (id: string) => {
    const response = await fetch('/api/user-cars', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (response.ok) setCars((current) => current.map((car) => ({ ...car, isPrimary: car.id === id })))
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Car className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-4">سجّل الدخول لإدارة سياراتك</h2>
        <Button onClick={() => setView({ name: 'login' })}>تسجيل الدخول</Button>
      </div>
    )
  }

  if (!['BUYER', 'SHOP_OWNER'].includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Car className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">هذه الصفحة مخصصة للمشترين وأصحاب المحلات</h2>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Car className="size-7 text-primary" />
            سياراتي
          </h1>
          <p className="text-muted-foreground mt-1">
            {cars.length === 0 ? 'لم تقم بإضافة سيارات بعد' : `${cars.length} سيارة محفوظة`}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4 ml-1" />
          إضافة سيارة
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">إضافة سيارة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الماركة *</Label>
                <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الماركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {POPULAR_BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الموديل *</Label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="مثال: Camry, Civic, Corolla"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>سنة الصنع</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  placeholder="2019"
                  min="1990"
                  max={new Date().getFullYear() + 1}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم مختصر (اختياري)</Label>
                <Input
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="سيارة العمل، سيارة العائلة..."
                />
              </div>
              <div className="space-y-2">
                <Label>الجيل (اختياري)</Label>
                <Input value={form.generation} onChange={(e) => setForm({ ...form, generation: e.target.value })} placeholder="مثال: E170 أو W206" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>المحرك (اختياري)</Label>
                <Input value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} placeholder="مثال: 1.6 أو 2.0 Turbo" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>الفئة / Trim (اختياري)</Label>
                <Input value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })} placeholder="مثال: GLI أو AMG" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={submitting}>
                {submitting ? 'جاري الحفظ...' : 'حفظ السيارة'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : cars.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Car className="size-12 mx-auto mb-3 opacity-40" />
            <p className="mb-4">لم تقم بإضافة سيارات بعد</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4 ml-1" />
              أضف سيارتك الأولى
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((car) => (
            <Card key={car.id} className="hover:shadow-md transition">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Car className="size-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{car.brand} {car.model}</h3>
                      <p className="text-sm text-muted-foreground">{[car.generation, car.year, car.engine, car.trim].filter(Boolean).join(' • ') || 'بيانات التوافق الأساسية فقط'}</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(car.id)}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
                {car.nickname && (
                  <Badge variant="secondary">{car.nickname}</Badge>
                )}
                {car.isPrimary && <Badge>السيارة الأساسية</Badge>}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSearchParts(car)}
                >
                  <Search className="size-4 ml-1" />
                  البحث عن قطع لهذه السيارة
                </Button>
                {!car.isPrimary && <Button variant="ghost" className="w-full" onClick={() => makePrimary(car.id)}>اجعلها السيارة الأساسية</Button>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
