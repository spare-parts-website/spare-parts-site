'use client'

import { useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import { StatusBadge, formatPrice } from '@/components/common'
import { AnalyticsView } from '@/components/views/analytics-view'
import { CouponsView } from '@/components/views/coupons-view'
import { ShopMessagesView } from '@/components/views/shop-messages-view'
import { SellerVerificationCard } from '@/components/seller-verification-card'
import { useToast } from '@/hooks/use-toast'
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
  deliveryAddress: string
  createdAt: string
  part: { id: string; name: string }
  buyer: { id: string; name: string; phone?: string | null }
}

export function ShopDashboardView({ tab: initialTab }: { tab?: 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages' }) {
  const { user } = useAppStore()
  const { toast } = useToast()
  const [tab, setTab] = useState<'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages'>(initialTab || 'parts')
  const [store, setStore] = useState<Store | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editPart, setEditPart] = useState<Part | null>(null)
  const [partForm, setPartForm] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    brand: '',
    condition: '',
    images: [] as string[],
    carModels: '',
    partNumber: '', oemNumber: '', searchAliases: '',
  })
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
  const csvInputRef = useRef<HTMLInputElement>(null)

  const loadStore = async () => {
    setLoadError(false)
    try {
      const response = await fetch('/api/shop/store', { cache: 'no-store' })
      const storeData = await response.json()
      if (!response.ok) throw new Error(storeData.error || 'STORE_LOAD_FAILED')
      const myStore = storeData.store
      if (!myStore) {
        setLoading(false)
        return
      }
      setStore(myStore)
      setStoreForm({
        name: myStore.name || '',
        description: myStore.description || '',
        address: myStore.address || '',
        phone: myStore.phone || '',
        image: myStore.image || '',
      })
    } catch {
      setLoadError(true)
      setLoading(false)
    }
  }

  // Better: fetch all parts and filter by store
  const loadAllParts = async () => {
    const res = await fetch('/api/parts?scope=mine', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'PARTS_LOAD_FAILED')
    setParts(data.parts || [])
  }

  const loadOrders = async () => {
    const res = await fetch('/api/orders?scope=shop', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'ORDERS_LOAD_FAILED')
    setOrders(data.orders || [])
  }

  const loadDashboard = async () => {
    setLoadError(false)
    setLoading(true)
    try {
      // These endpoints all authenticate independently, so starting them together
      // removes a full network round trip from opening the seller dashboard.
      const [storeResponse, partsResponse, ordersResponse] = await Promise.all([
        fetch('/api/shop/store', { cache: 'no-store' }),
        fetch('/api/parts?scope=mine', { cache: 'no-store' }),
        fetch('/api/orders?scope=shop', { cache: 'no-store' }),
      ])
      const [storeData, partsData, ordersData] = await Promise.all([
        storeResponse.json(),
        partsResponse.json(),
        ordersResponse.json(),
      ])
      if (!storeResponse.ok || !partsResponse.ok || !ordersResponse.ok) {
        throw new Error('SHOP_DASHBOARD_LOAD_FAILED')
      }

      const myStore = storeData.store
      if (myStore) {
        setStore(myStore)
        setStoreForm({
          name: myStore.name || '',
          description: myStore.description || '',
          address: myStore.address || '',
          phone: myStore.phone || '',
          image: myStore.image || '',
        })
      }
      setParts(partsData.parts || [])
      setOrders(ordersData.orders || [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role !== 'SHOP_OWNER') {
      setLoading(false)
      return
    }
    void loadDashboard()
  }, [user])

  const handleSavePart = async () => {
    if (imageUploading || isAnyUploadInProgress()) {
      toast({ title: 'جاري رفع الصورة', description: 'انتظر اكتمال رفع الصورة قبل الحفظ', variant: 'destructive' })
      return
    }
    if (!partForm.name || !partForm.price || !partForm.condition.trim()) {
      toast({ title: 'خطأ', description: 'الاسم والسعر وحالة المنتج مطلوبة', variant: 'destructive' })
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
      setPartForm({ name: '', description: '', price: '', stock: '', category: '', brand: '', condition: '', images: [], carModels: '', partNumber: '', oemNumber: '', searchAliases: '' })
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

  const bulkRestock = async () => { const value = Number(window.prompt('الكمية الجديدة لكل القطع منخفضة المخزون')); if (!Number.isInteger(value) || value < 0) return; const items = parts.filter((part) => part.stock <= 3).map((part) => ({ id: part.id, price: part.price, stock: value })); if (!items.length) return toast({ title: 'لا توجد قطع منخفضة المخزون' }); const response = await fetch('/api/shop/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }); if (response.ok) { toast({ title: `تم تحديث ${items.length} قطعة` }); loadAllParts() } }
  const importCsv = async (file: File) => { const form = new FormData(); form.append('file', file); const response = await fetch('/api/shop/inventory', { method: 'POST', body: form }); const data = await response.json(); toast({ title: response.ok ? `تم تحديث ${data.updated} قطعة` : 'فشل الاستيراد', description: data.error, variant: response.ok ? 'default' : 'destructive' }); if (response.ok) loadAllParts() }

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
      <div className="page-heading mb-0">
        <div>
          <p className="page-kicker">إدارة المتجر</p>
          <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">لوحة تحكم المحل</h1>
        <p className="text-muted-foreground mt-1">
          {store ? store.name : 'جاري التحميل...'}
        </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-center" role="alert">
          <p className="font-semibold">تعذر تحميل بيانات لوحة المحل</p>
          <Button className="mt-3" variant="outline" onClick={() => void loadDashboard()}>إعادة المحاولة</Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); window.history.pushState({}, '', `/seller/${v}`) }}>
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
                setPartForm({ name: '', description: '', price: '', stock: '', category: '', brand: '', condition: '', images: [], carModels: '', partNumber: '', oemNumber: '', searchAliases: '' })
              }}
            >
              <Plus className="size-4 ml-1" />
              إضافة قطعة
            </Button>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={bulkRestock}>تحديث المخزون المنخفض ({parts.filter((part) => part.stock <= 3).length})</Button><Button variant="outline" onClick={() => window.open('/api/shop/inventory')}>تصدير CSV</Button><Button variant="outline" onClick={() => csvInputRef.current?.click()}>استيراد CSV</Button><input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCsv(file); event.currentTarget.value = '' }} /></div>
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
                    placeholder="0.00"
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
                <div className="space-y-2"><Label>رقم القطعة</Label><Input value={partForm.partNumber} onChange={(e) => setPartForm({ ...partForm, partNumber: e.target.value })} placeholder="Part number" dir="ltr" /></div>
                <div className="space-y-2"><Label>رقم OEM</Label><Input value={partForm.oemNumber} onChange={(e) => setPartForm({ ...partForm, oemNumber: e.target.value })} placeholder="OEM number" dir="ltr" /></div>
                <div className="space-y-2 md:col-span-2"><Label>أسماء بحث إضافية</Label><Input value={partForm.searchAliases} onChange={(e) => setPartForm({ ...partForm, searchAliases: e.target.value })} placeholder="مرادفات عربية وإنجليزية مفصولة بفواصل" /></div>
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
              <div className="space-y-2">
                <Label>السيارات المتوافقة</Label>
                <Textarea
                  value={partForm.carModels}
                  onChange={(e) => setPartForm({ ...partForm, carModels: e.target.value })}
                  placeholder="افصل بين كل سيارة بفاصلة. مثال: Toyota Camry 2018-2023, Honda Civic 2017-2022"
                  rows={2}
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  اكتب ماركة السيارة وموديلها وسنة الصنع، افصل بين كل سيارة بفاصلة (,)
                </p>
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
                  <Button variant="outline" onClick={() => { setEditPart(null); setPartForm({ name: '', description: '', price: '', stock: '', category: '', brand: '', condition: '', images: [], carModels: '', partNumber: '', oemNumber: '', searchAliases: '' }) }}>
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
                        <h3 className="font-semibold">{order.part.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleString('ar-EG')}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
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
                  placeholder="01xxxxxxxxx"
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
