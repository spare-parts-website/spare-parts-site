'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageUpload, MultiImageUpload, isAnyUploadInProgress } from '@/components/image-upload'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Package,
  Store as StoreIcon,
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  MapPin,
  Phone,
  Save,
  TrendingUp,
  Ticket,
  MessageSquare,
  Bot,
} from 'lucide-react'
import { StatusBadge, formatPrice } from '@/components/common'
import { AnalyticsView } from '@/components/views/analytics-view'
import { CouponsView } from '@/components/views/coupons-view'
import { ShopMessagesView } from '@/components/views/shop-messages-view'
import { SellerVerificationCard } from '@/components/seller-verification-card'
import { useToast } from '@/hooks/use-toast'
import { subscribeAIDraft } from '@/lib/ai/draft-client'
import { parseVehicleCompatibility, type CompatibilityInput } from '@/lib/vehicle-compatibility'
import { pushDashboardTab } from '@/lib/instant-dashboard-navigation'
import { loadSellerCore, readSellerCore, updateSellerCore, type SellerCoreTab } from '@/lib/seller-dashboard-cache'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Store {
  id: string
  name: string
  description?: string | null
  address?: string | null
  phone?: string | null
  image?: string | null
}

interface Part {
  id: string
  name: string
  description?: string | null
  price: number
  stock: number
  category?: string | null
  brand?: string | null
  condition?: string | null
  image?: string | null
  images?: { id: string; url: string; position: number }[]
  carModels?: string | null
  universal: boolean
  fitmentNotes?: string | null
  compatibilities?: Array<CompatibilityInput & { id: string }>
  partNumber?: string | null
  oemNumber?: string | null
  searchAliases?: string | null
  blocked: boolean
  store: { id: string; name: string }
}

interface Order {
  id: string
  quantity: number
  totalPrice: number
  status: string
  paymentStatus: string
  paymentMethod?: string | null
  shippingFee?: number
  deliveryAddress: string
  createdAt: string
  part: { id: string; name: string }
  items?: Array<{
    id: string
    partId?: string | null
    productName: string
    unitPrice: number
    quantity: number
    discount: number
    itemTotal: number
  }>
  buyer: { id: string; name: string; phone?: string | null }
}

type SellerCorePayload = {
  store?: Store | null
  parts?: Part[]
  orders?: Order[]
}

const emptyPartForm = () => ({
  name: '', description: '', price: '', stock: '', category: '', brand: '', condition: '', images: [] as string[],
  carModels: '', compatibilities: [] as CompatibilityInput[], universal: false, fitmentNotes: '',
  partNumber: '', oemNumber: '', searchAliases: '',
})

const emptyCompatibility = (): CompatibilityInput => ({
  make: '', model: '', generation: '', yearFrom: null, yearTo: null, engine: '', trim: '', notes: '',
})

function coreTab(value: string): SellerCoreTab | null {
  return value === 'parts' || value === 'orders' || value === 'store' ? value : null
}

export function ShopDashboardView({ tab: initialTab }: { tab?: 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages' }) {
  const pathname = usePathname() || '/seller/parts'
  const user = useAppStore((state) => state.user)
  const { toast } = useToast()
  const routeTab = pathname.split('/')[2] as 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages' | undefined
  const tab = ['parts', 'orders', 'store', 'analytics', 'coupons', 'messages'].includes(routeTab || '') ? routeTab! : initialTab || 'parts'
  const [store, setStore] = useState<Store | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editPart, setEditPart] = useState<Part | null>(null)
  const [partForm, setPartForm] = useState(emptyPartForm)
  const [storeForm, setStoreForm] = useState({
    name: '',
    description: '',
    address: '',
    phone: '',
    image: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [storeImageUploading, setStoreImageUploading] = useState(false)
  const partFormRef = useRef<HTMLDivElement>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    return subscribeAIDraft('listing', (draft) => {
      pushDashboardTab('seller', 'parts')
      setPartForm((current) => ({
        ...current,
        name: typeof draft.name === 'string' ? draft.name : current.name,
        description: typeof draft.description === 'string' ? draft.description : current.description,
        price: draft.price === undefined ? current.price : String(draft.price),
        stock: draft.stock === undefined ? current.stock : String(draft.stock),
        brand: typeof draft.brand === 'string' ? draft.brand : current.brand,
        category: typeof draft.category === 'string' ? draft.category : current.category,
        condition: typeof draft.condition === 'string' ? draft.condition : current.condition,
        partNumber: typeof draft.partNumber === 'string' ? draft.partNumber : current.partNumber,
        oemNumber: typeof draft.oemNumber === 'string' ? draft.oemNumber : current.oemNumber,
        searchAliases: typeof draft.searchAliases === 'string' ? draft.searchAliases : current.searchAliases,
        carModels: typeof draft.carModels === 'string' ? draft.carModels : current.carModels,
        compatibilities: typeof draft.carModels === 'string' ? parseVehicleCompatibility(draft.carModels) : current.compatibilities,
      }))
      requestAnimationFrame(() => partFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    })
  }, [])

  const applyCorePayload = useCallback((nextTab: SellerCoreTab, data: SellerCorePayload) => {
    if (nextTab === 'parts') {
      setParts(data.parts || [])
    } else if (nextTab === 'orders') {
      setOrders(data.orders || [])
    } else {
      const myStore = data.store || null
      setStore(myStore)
      if (myStore) setStoreForm({ name: myStore.name || '', description: myStore.description || '', address: myStore.address || '', phone: myStore.phone || '', image: myStore.image || '' })
    }
  }, [])

  const loadTab = useCallback(async (nextTab: typeof tab, force = false) => {
    const requestId = ++requestVersion.current
    const userId = user?.id
    if (!userId) {
      if (requestId === requestVersion.current) setLoading(false)
      return
    }

    const nextCoreTab = coreTab(nextTab)
    if (!nextCoreTab) {
      setLoadError(false)
      setLoading(false)
      return
    }

    const cached = readSellerCore(userId, nextCoreTab)?.data as SellerCorePayload | undefined
    if (cached) {
      applyCorePayload(nextCoreTab, cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setLoadError(false)

    try {
      const data = await loadSellerCore(userId, nextCoreTab, force) as SellerCorePayload
      if (requestId !== requestVersion.current) return
      applyCorePayload(nextCoreTab, data)
    } catch {
      if (requestId === requestVersion.current) setLoadError(true)
    } finally {
      if (requestId === requestVersion.current) setLoading(false)
    }
  }, [applyCorePayload, user?.id])

  useEffect(() => {
    if (user?.role !== 'SHOP_OWNER') {
      requestVersion.current += 1
      setLoading(false)
      return
    }
    void loadTab(tab)
  }, [loadTab, tab, user?.role])

  useEffect(() => {
    if (user?.role !== 'SHOP_OWNER' || !user.id) return
    const cachedStore = readSellerCore(user.id, 'store')?.data as SellerCorePayload | undefined
    if (cachedStore && 'store' in cachedStore) applyCorePayload('store', cachedStore)
  }, [applyCorePayload, user?.id, user?.role])

  const loadAllParts = () => loadTab('parts', true)
  const loadOrders = () => loadTab('orders', true)

  const handleSavePart = async () => {
    if (imageUploading || isAnyUploadInProgress()) {
      toast({ title: 'جاري رفع الصورة', description: 'انتظر اكتمال رفع الصورة قبل الحفظ', variant: 'destructive' })
      return
    }
    if (!partForm.name || !partForm.price || !partForm.condition.trim()) {
      toast({ title: 'خطأ', description: 'الاسم والسعر وحالة المنتج مطلوبة', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(Number(partForm.price)) || Number(partForm.price) <= 0) {
      toast({ title: 'خطأ', description: 'يجب أن يكون سعر المنتج أكبر من صفر.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const method = editPart ? 'PUT' : 'POST'
      const body = editPart ? { ...partForm, id: editPart.id } : partForm
      const res = await fetch('/api/parts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({
        title: editPart ? 'تم التحديث' : 'تمت الإضافة',
        description: 'تم حفظ قطعة الغيار بنجاح',
      })
      setEditPart(null)
      setPartForm(emptyPartForm())
      loadAllParts()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePart = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه القطعة؟')) return
    const res = await fetch(`/api/parts?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'تم الحذف', description: 'تم حذف قطعة الغيار' })
      loadAllParts()
    }
  }


  const handleEditPart = (part: Part) => {
    setEditPart(part)
    setPartForm({
      name: part.name,
      description: part.description || '',
      price: part.price.toString(),
      stock: part.stock.toString(),
      category: part.category || '',
      brand: part.brand || '',
      condition: part.condition || '',
      images: [part.image, ...(part.images || []).slice().sort((a, b) => a.position - b.position).map((item) => item.url)].filter(Boolean) as string[],
      carModels: part.carModels || '',
      compatibilities: part.compatibilities?.length ? part.compatibilities.map(({ id: _id, ...item }) => item) : parseVehicleCompatibility(part.carModels),
      universal: part.universal,
      fitmentNotes: part.fitmentNotes || '',
      partNumber: part.partNumber || '', oemNumber: part.oemNumber || '', searchAliases: part.searchAliases || '',
    })
    requestAnimationFrame(() => {
      partFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleOrderAction = async (id: string, action: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...(action === 'ship' ? { trackingNumber: window.prompt('رقم التتبع (اختياري)') || '' } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم التحديث', description: 'تم تحديث حالة الطلب' })
      loadOrders()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveStore = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/shop/store', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'خطأ', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: 'تم الحفظ', description: 'تم تحديث بيانات المتجر' })
      setStore(data.store)
      if (user?.id) updateSellerCore(user.id, 'store', { store: data.store })
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || user.role !== 'SHOP_OWNER') {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <StoreIcon className="size-16 mx-auto mb-3 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">هذه الصفحة مخصصة لأصحاب المحلات</h2>
      </div>
    )
  }

  return (
    <div className="content-container dashboard-shell min-w-0 space-y-7 py-10">
      <div className="page-heading mb-0 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-kicker">إدارة المتجر</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">صفحة المحل</h1>
        <p className="text-muted-foreground mt-1">
          {store ? store.name : 'جاري التحميل...'}
        </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => window.dispatchEvent(new CustomEvent('ghyar-ai-open', { detail: { prompt: 'حلل أداء متجري واقترح أهم الخطوات اللي أعملها دلوقتي' } }))}><Bot className="size-4" />اسأل مساعد المتجر</Button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-center" role="alert">
          <p className="font-semibold">تعذر تحميل بيانات صفحة المحل</p>
          <Button className="mt-3" variant="outline" onClick={() => void loadTab(tab, true)}>إعادة المحاولة</Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => pushDashboardTab('seller', v)}>
        <TabsList className="grid w-full max-w-4xl grid-cols-2 rounded-2xl bg-muted/70 p-1 sm:grid-cols-6">
          <TabsTrigger value="parts" className="gap-1.5 text-[11px] sm:text-sm">
            <Package className="size-4" />
            <span>القطع</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5 text-[11px] sm:text-sm">
            <ShoppingBag className="size-4" />
            <span>الطلبات</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 text-[11px] sm:text-sm">
            <TrendingUp className="size-4" />
            <span>تحليلات</span>
          </TabsTrigger>
          <TabsTrigger value="coupons" className="gap-1.5 text-[11px] sm:text-sm">
            <Ticket className="size-4" />
            <span>كوبونات</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5 text-[11px] sm:text-sm">
            <MessageSquare className="size-4" />
            <span>الرسائل</span>
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-1.5 text-[11px] sm:text-sm">
            <StoreIcon className="size-4" />
            <span>المتجر</span>
          </TabsTrigger>
        </TabsList>

        {/* Parts tab */}
        <TabsContent value="parts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">قطع الغيار ({parts.length})</h2>
            <Button
              onClick={() => {
                setEditPart(null)
                setPartForm(emptyPartForm())
              }}
            >
              <Plus className="size-4 ml-1" />
              إضافة قطعة
            </Button>
          </div>

          {/* Add/Edit form */}
          <Card ref={partFormRef} className="market-card scroll-mt-28">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">
                {editPart ? 'تعديل قطعة الغيار' : 'إضافة قطعة غيار جديدة'}
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم القطعة *</Label>
                  <Input
                    value={partForm.name}
                    onChange={(e) => setPartForm({ ...partForm, name: e.target.value })}
                    placeholder="مثال: فلتر زيت تويوتا"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الماركة</Label>
                  <Input
                    value={partForm.brand}
                    onChange={(e) => setPartForm({ ...partForm, brand: e.target.value })}
                    placeholder="مثال: تويوتا، بوش"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <Input
                    value={partForm.category}
                    onChange={(e) => setPartForm({ ...partForm, category: e.target.value })}
                    placeholder="مثال: فلاتر، بطاريات"
                  />
                </div>
                <div className="space-y-2">
                  <Label>حالة المنتج *</Label>
                  <Input
                    value={partForm.condition}
                    onChange={(e) => setPartForm({ ...partForm, condition: e.target.value })}
                    placeholder="مثال: استيراد جديد، استيراد مستعمل"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label>السعر (ج.م) *</Label>
                  <Input
                    type="number"
                    value={partForm.price}
                    onChange={(e) => setPartForm({ ...partForm, price: e.target.value })}
                    placeholder="مثال: 2500"
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الكمية المتوفرة</Label>
                  <Input
                    type="number"
                    value={partForm.stock}
                    onChange={(e) => setPartForm({ ...partForm, stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>صور القطعة</Label>
                  <MultiImageUpload
                    value={partForm.images}
                    onChange={(urls) => setPartForm((prev) => ({ ...prev, images: urls }))}
                    onUploadingChange={setImageUploading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Textarea
                  value={partForm.description}
                  onChange={(e) => setPartForm({ ...partForm, description: e.target.value })}
                  placeholder="وصف تفصيلي للقطعة..."
                  rows={3}
                />
              </div>
              <div className="space-y-4 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label className="text-base">توافق السيارة</Label>
                    <p className="mt-1 text-xs text-muted-foreground">أضف بيانات دقيقة فقط. إذا لم تكن متأكدًا اتركها فارغة ليظهر التوافق كغير مؤكد.</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={partForm.universal} onChange={(event) => setPartForm((current) => ({ ...current, universal: event.target.checked, compatibilities: event.target.checked ? [] : current.compatibilities }))} className="size-4 accent-primary" />
                    قطعة عامة لكل السيارات
                  </label>
                </div>
                {!partForm.universal && (
                  <div className="space-y-3">
                    {partForm.compatibilities.map((item, index) => (
                      <div key={index} className="space-y-3 rounded-xl bg-muted/35 p-3">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-1"><Label>الشركة *</Label><Input value={item.make} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, make: event.target.value } : entry) }))} placeholder="Toyota" dir="ltr" /></div>
                          <div className="space-y-1"><Label>الموديل *</Label><Input value={item.model} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, model: event.target.value } : entry) }))} placeholder="Corolla" dir="ltr" /></div>
                          <div className="space-y-1"><Label>الجيل</Label><Input value={item.generation || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, generation: event.target.value } : entry) }))} placeholder="E170" dir="ltr" /></div>
                          <div className="space-y-1"><Label>المحرك</Label><Input value={item.engine || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, engine: event.target.value } : entry) }))} placeholder="1.6L" dir="ltr" /></div>
                          <div className="space-y-1"><Label>من سنة</Label><Input type="number" value={item.yearFrom || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, yearFrom: event.target.value ? Number(event.target.value) : null } : entry) }))} min="1950" max="2030" dir="ltr" /></div>
                          <div className="space-y-1"><Label>إلى سنة</Label><Input type="number" value={item.yearTo || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, yearTo: event.target.value ? Number(event.target.value) : null } : entry) }))} min="1950" max="2030" dir="ltr" /></div>
                          <div className="space-y-1"><Label>الفئة / Trim</Label><Input value={item.trim || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, trim: event.target.value } : entry) }))} placeholder="GLI" dir="ltr" /></div>
                          <div className="flex items-end"><Button type="button" variant="ghost" className="text-destructive" onClick={() => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.filter((_, entryIndex) => entryIndex !== index) }))}><Trash2 className="ml-1 size-4" />حذف السيارة</Button></div>
                        </div>
                        <Input value={item.notes || ''} onChange={(event) => setPartForm((current) => ({ ...current, compatibilities: current.compatibilities.map((entry, entryIndex) => entryIndex === index ? { ...entry, notes: event.target.value } : entry) }))} placeholder="ملاحظة خاصة بهذا التوافق (اختياري)" />
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={() => setPartForm((current) => ({ ...current, compatibilities: [...current.compatibilities, emptyCompatibility()] }))}><Plus className="ml-1 size-4" />إضافة سيارة متوافقة</Button>
                  </div>
                )}
                <div className="space-y-2"><Label>ملاحظات التوافق العامة</Label><Textarea value={partForm.fitmentNotes} onChange={(event) => setPartForm((current) => ({ ...current, fitmentNotes: event.target.value }))} placeholder="مثال: يحتاج مراجعة رقم الشاسيه قبل الطلب" rows={2} /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSavePart} disabled={submitting || imageUploading || isAnyUploadInProgress()}>
                  <Save className="size-4 ml-1" />
                  {imageUploading
                    ? 'جاري رفع الصورة...'
                    : submitting
                      ? 'جاري الحفظ...'
                      : editPart
                        ? 'حفظ التعديلات'
                        : 'إضافة القطعة'}
                </Button>
                {editPart && (
                  <Button variant="outline" onClick={() => { setEditPart(null); setPartForm(emptyPartForm()) }}>
                    إلغاء
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parts list */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : parts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="size-10 mx-auto mb-2 opacity-50" />
                <p>لا توجد قطع غيار مضافة</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {parts.map((part) => (
                <Card key={part.id} className="market-card">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="size-16 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 overflow-hidden">
                      {part.image ? (
                         
                        <img src={part.image} alt={part.name} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                      ) : (
                        <Package className="size-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold line-clamp-1">{part.name}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          {part.blocked && (
                            <Badge variant="destructive" className="text-xs">محظور</Badge>
                          )}
                          {part.stock === 0 && (
                            <Badge variant="outline" className="text-xs text-red-600">نفد</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-primary">{formatPrice(part.price)}</span>
                        <span>المخزون: {part.stock}</span>
                        {part.category && <span>• {part.category}</span>}
                        {part.brand && <span>• {part.brand}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEditPart(part)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeletePart(part.id)}>
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Orders tab */}
        <TabsContent value="orders" className="space-y-4">
          <h2 className="text-lg font-semibold">طلبات التوصيل ({orders.length})</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ShoppingBag className="size-10 mx-auto mb-2 opacity-50" />
                <p>لا توجد طلبات بعد</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Card key={order.id} className="market-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{order.items && order.items.length > 1 ? `طلب مجمع: ${order.items.length} منتجات` : order.items?.[0]?.productName || order.part.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleString('ar-EG')}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    {order.items?.length ? (
                      <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-medium">{item.productName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {item.quantity} × {formatPrice(item.unitPrice)} = {formatPrice(item.itemTotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="block text-xs text-muted-foreground">العميل</span>
                        <span className="font-medium">{order.buyer.name}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">الهاتف</span>
                        <span className="font-medium" dir="ltr">{order.buyer.phone || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">الكمية</span>
                        <span className="font-medium">{order.quantity}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">الإجمالي</span>
                        <span className="font-medium text-primary">{formatPrice(order.totalPrice)}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">الشحن</span>
                        <span className="font-medium">{formatPrice(order.shippingFee || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">الدفع</span>
                        <StatusBadge status={order.paymentStatus} />
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-1">
                      <MapPin className="size-3.5 mt-0.5 shrink-0" />
                      <span>{order.deliveryAddress}</span>
                    </div>
                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {order.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleOrderAction(order.id, 'approve')}
                            disabled={submitting}
                          >
                            <Check className="size-4 ml-1" />
                            موافقة على الطلب
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderAction(order.id, 'reject')}
                            disabled={submitting}
                          >
                            <X className="size-4 ml-1" />
                            رفض
                          </Button>
                        </>
                      )}
                      {order.status === 'APPROVED' && (
                        <><Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">الدفع عند الاستلام</Badge><Button size="sm" onClick={() => handleOrderAction(order.id, 'ship')} disabled={submitting}>خرج للتوصيل</Button></>
                      )}
                      {order.status === 'PAID' && <Button size="sm" onClick={() => handleOrderAction(order.id, 'ship')} disabled={submitting}>خرج للتوصيل</Button>}
                      {order.status === 'SHIPPED' && <Badge variant="outline">قيد التوصيل</Badge>}
                      {order.status === 'DELIVERED' && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                          تم التوصيل
                        </Badge>
                      )}
                      {order.status === 'RETURNED' && (
                        <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                          تم الاسترجاع
                        </Badge>
                      )}
                      {order.status === 'REJECTED' && (
                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                          مرفوض
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsView />
        </TabsContent>

        {/* Coupons tab */}
        <TabsContent value="coupons" className="space-y-4">
          <CouponsView />
        </TabsContent>

        <TabsContent value="messages">
          <ShopMessagesView />
        </TabsContent>

        {/* Store tab */}
        <TabsContent value="store" className="space-y-4">
          <SellerVerificationCard />
          <Card className="market-card">
            <CardHeader>
              <CardTitle>معلومات المتجر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المتجر</Label>
                <Input
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Textarea
                  value={storeForm.description}
                  onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                  rows={3}
                  placeholder="وصف المتجر..."
                />
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input
                  value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  placeholder="المدينة - الحي - الشارع"
                />
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <Input
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  placeholder="01********"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>شعار المتجر</Label>
                <ImageUpload
                  purpose="store"
                  value={storeForm.image}
                  onChange={(url) => setStoreForm((prev) => ({ ...prev, image: url }))}
                  onUploadingChange={setStoreImageUploading}
                  cropPreview
                />
              </div>
              <Button onClick={handleSaveStore} disabled={submitting || storeImageUploading}>
                <Save className="size-4 ml-1" />
                {submitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
