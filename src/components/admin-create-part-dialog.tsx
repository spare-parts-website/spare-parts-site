'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

type SellerStore = { id: string; name: string; owner?: { id: string; name: string } }

export function AdminCreatePartDialog({ stores, onSaved }: { stores: SellerStore[]; onSaved: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ storeId: '', name: '', condition: 'جديد', price: '', stock: '0', brand: '', category: '' })

  useEffect(() => {
    if (open && !form.storeId && stores[0]) setForm((current) => ({ ...current, storeId: stores[0].id }))
  }, [open, stores, form.storeId])

  const save = async () => {
    if (saving || !form.storeId || form.name.trim().length < 2 || !form.condition.trim() || !form.price) return
    setSaving(true)
    try {
      const store = stores.find((item) => item.id === form.storeId)
      const response = await fetch('/api/admin/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sellerId: store?.owner?.id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر إنشاء العرض')
      toast({ title: 'تم إنشاء العرض', description: `تم حفظه داخل ${store?.name || 'متجر البائع'}` })
      setOpen(false)
      setForm({ storeId: stores[0]?.id || '', name: '', condition: 'جديد', price: '', stock: '0', brand: '', category: '' })
      onSaved()
    } catch (error: any) {
      toast({ title: 'تعذر إنشاء العرض', description: error.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />إضافة عرض نيابة عن بائع</Button></DialogTrigger><DialogContent dir="rtl"><DialogHeader><DialogTitle>إنشاء عرض داخل متجر بائع</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>المتجر المالك</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.storeId} onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.owner?.name ? ` — ${store.owner.name}` : ''}</option>)}</select></div><div className="space-y-2"><Label>اسم القطعة</Label><Input value={form.name} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>السعر (ج.م)</Label><Input type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} /></div><div className="space-y-2"><Label>المخزون</Label><Input type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} /></div><div className="space-y-2"><Label>الماركة (اختياري)</Label><Input value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></div><div className="space-y-2"><Label>الفئة (اختياري)</Label><Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></div></div><div className="space-y-2"><Label>حالة المنتج</Label><Input value={form.condition} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} /></div><div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button><Button onClick={() => void save()} disabled={saving || !form.storeId || form.name.trim().length < 2 || !form.price}>{saving ? 'جاري الإنشاء...' : 'إنشاء العرض'}</Button></div></div></DialogContent></Dialog>
}
