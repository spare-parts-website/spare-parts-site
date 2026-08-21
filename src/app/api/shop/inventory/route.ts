import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'

async function storeFor(userId: string) { return db.store.findUnique({ where: { ownerId: userId }, select: { id: true } }) }
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function GET() {
  try { const session = await requireRole('SHOP_OWNER'); const store = await storeFor(session.id); if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 }); const parts = await db.part.findMany({ where: { storeId: store.id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, partNumber: true, oemNumber: true, price: true, stock: true, condition: true } }); const csv = ['id,name,partNumber,oemNumber,price,stock,condition', ...parts.map((item) => [item.id,item.name,item.partNumber,item.oemNumber,item.price,item.stock,item.condition].map(csvCell).join(','))].join('\r\n'); return new NextResponse('\uFEFF'+csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ghyar-market-inventory.csv"' } }) } catch (e: any) { return NextResponse.json({ error: e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN' ? 'غير مصرح' : 'تعذر التصدير' }, { status: 403 }) }
}

export async function PUT(req: NextRequest) {
  try { const session = await requireRole('SHOP_OWNER'); const store = await storeFor(session.id); if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 }); const { items } = await req.json(); if (!Array.isArray(items) || items.length < 1 || items.length > 200) return NextResponse.json({ error: 'بيانات التحديث غير صالحة' }, { status: 400 }); await db.$transaction(items.map((item) => { const price = Number(item.price), stock = Number(item.stock); if (typeof item.id !== 'string' || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) throw new Error('INVALID_ITEMS'); return db.part.updateMany({ where: { id: item.id, storeId: store.id }, data: { price, stock } }) })); await audit({ actorId: session.id, action: 'INVENTORY_BULK_UPDATED', targetType: 'store', targetId: store.id, metadata: { count: items.length } }); return NextResponse.json({ ok: true }) } catch (e: any) { return NextResponse.json({ error: e.message === 'INVALID_ITEMS' ? 'السعر أو المخزون غير صالح' : 'تعذر التحديث الجماعي' }, { status: 400 }) }
}

export async function POST(req: NextRequest) {
  try { const session = await requireRole('SHOP_OWNER'); const store = await storeFor(session.id); if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 }); const form = await req.formData(); const file = form.get('file'); if (!(file instanceof File) || file.size > 1024 * 1024) return NextResponse.json({ error: 'ملف CSV مطلوب وبحد أقصى 1 ميجا' }, { status: 400 }); const text = await file.text(); const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(1, 201).filter(Boolean); let updated = 0; for (const row of rows) { const cells = row.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.map((cell) => cell.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"')) || []; const [id,,,,priceValue,stockValue] = cells; const price = Number(priceValue), stock = Number(stockValue); if (id && Number.isFinite(price) && price >= 0 && Number.isInteger(stock) && stock >= 0) updated += (await db.part.updateMany({ where: { id, storeId: store.id }, data: { price, stock } })).count } await audit({ actorId: session.id, action: 'INVENTORY_CSV_IMPORTED', targetType: 'store', targetId: store.id, metadata: { updated } }); return NextResponse.json({ updated }) } catch { return NextResponse.json({ error: 'تعذر استيراد الملف' }, { status: 400 }) }
}
