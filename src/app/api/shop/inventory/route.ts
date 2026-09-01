import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeMarketplaceBrand, normalizeMarketplaceCategory, normalizeMarketplaceCondition } from '@/lib/marketplace-taxonomy'

const MAX_ROWS = 200
const MAX_FILE_BYTES = 1024 * 1024
const MAX_PRICE = 100_000_000
const MAX_STOCK = 1_000_000
const CSV_HEADER = ['id', 'name', 'partNumber', 'oemNumber', 'price', 'stock', 'condition', 'category', 'brand']
const LEGACY_CSV_HEADER = CSV_HEADER.slice(0, 7)

type InventoryItem = { id: string; price: number; stock: number; condition?: string | null; category?: string | null; brand?: string | null }
type ValidationError = { row: number; field: string; message: string }

async function storeFor(userId: string) {
  return db.store.findUnique({ where: { ownerId: userId }, select: { id: true } })
}

function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row) }
  return rows
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value.trim().replace(',', '.'))
  return Number.NaN
}

async function validateItems(storeId: string, rawItems: unknown[], rowOffset = 1) {
  const errors: ValidationError[] = []
  const items: InventoryItem[] = []
  const seen = new Set<string>()
  rawItems.forEach((raw, index) => {
    const row = rowOffset + index
    if (!raw || typeof raw !== 'object') { errors.push({ row, field: 'row', message: 'الصف غير صالح' }); return }
    const value = raw as Record<string, unknown>
    const id = typeof value.id === 'string' ? value.id.trim() : ''
    const price = numberValue(value.price)
    const stock = numberValue(value.stock)
    if (!id) errors.push({ row, field: 'id', message: 'معرف القطعة مطلوب' })
    else if (seen.has(id)) errors.push({ row, field: 'id', message: 'لا يمكن تكرار القطعة في نفس التحديث' })
    else seen.add(id)
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) errors.push({ row, field: 'price', message: 'السعر يجب أن يكون أكبر من صفر وبحد أقصى 100 مليون' })
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) errors.push({ row, field: 'stock', message: 'المخزون يجب أن يكون رقماً صحيحاً من 0 إلى مليون' })
    if (id && Number.isFinite(price) && price > 0 && price <= MAX_PRICE && Number.isInteger(stock) && stock >= 0 && stock <= MAX_STOCK) {
      const condition = typeof value.condition === 'string' ? normalizeMarketplaceCondition(value.condition) || null : undefined
      const category = typeof value.category === 'string' ? normalizeMarketplaceCategory(value.category) || null : undefined
      const brand = typeof value.brand === 'string' ? normalizeMarketplaceBrand(value.brand) || null : undefined
      items.push({ id, price, stock, condition, category, brand })
    }
  })

  if (!errors.length) {
    const owned = await db.part.findMany({ where: { storeId, id: { in: items.map((item) => item.id) } }, select: { id: true } })
    const ownedIds = new Set(owned.map((part) => part.id))
    items.forEach((item, index) => { if (!ownedIds.has(item.id)) errors.push({ row: rowOffset + index, field: 'id', message: 'القطعة غير موجودة في متجرك' }) })
  }
  return { items, errors }
}

async function applyItems(storeId: string, items: InventoryItem[]) {
  await db.$transaction(items.map((item) => db.part.updateMany({
    where: { id: item.id, storeId },
    data: {
      price: item.price,
      stock: item.stock,
      ...(item.condition !== undefined ? { condition: item.condition } : {}),
      ...(item.category !== undefined ? { category: item.category } : {}),
      ...(item.brand !== undefined ? { brand: item.brand } : {}),
    },
  })))
}

export async function GET() {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await storeFor(session.id)
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const parts = await db.part.findMany({ where: { storeId: store.id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, partNumber: true, oemNumber: true, price: true, stock: true, condition: true, category: true, brand: true } })
    const csv = [CSV_HEADER.join(','), ...parts.map((item) => [item.id, item.name, item.partNumber, item.oemNumber, item.price, item.stock, item.condition, item.category, item.brand].map(csvCell).join(','))].join('\r\n')
    return new NextResponse('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ghyar-market-inventory.csv"' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message) ? 'غير مصرح' : 'تعذر التصدير' }, { status: 403 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await storeFor(session.id)
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const body = await req.json() as { items?: unknown }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ROWS) return NextResponse.json({ error: 'يجب إرسال من 1 إلى 200 صفاً' }, { status: 400 })
    const result = await validateItems(store.id, body.items)
    if (result.errors.length) return NextResponse.json({ error: 'يوجد خطأ في بيانات التحديث ولم يتم حفظ أي صف', errors: result.errors }, { status: 400 })
    await applyItems(store.id, result.items)
    await audit({ actorId: session.id, action: 'INVENTORY_BULK_UPDATED', targetType: 'store', targetId: store.id, metadata: { count: result.items.length } })
    return NextResponse.json({ ok: true, updated: result.items.length })
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error('Inventory bulk update failed', { error: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'تعذر التحديث الجماعي' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('SHOP_OWNER')
    const store = await storeFor(session.id)
    if (!store) return NextResponse.json({ error: 'لا يوجد متجر' }, { status: 404 })
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'ملف CSV مطلوب وبحد أقصى 1 ميجا' }, { status: 400 })
    const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
    if (rows.length < 2 || rows.length > MAX_ROWS + 1) return NextResponse.json({ error: 'يجب أن يحتوي الملف على صف عنوان ومن 1 إلى 200 صفاً' }, { status: 400 })
    const header = rows[0].map((value) => value.trim())
    const isCurrentHeader = CSV_HEADER.every((value, index) => header[index] === value) && header.length === CSV_HEADER.length
    const isLegacyHeader = LEGACY_CSV_HEADER.every((value, index) => header[index] === value) && header.length === LEGACY_CSV_HEADER.length
    if (!isCurrentHeader && !isLegacyHeader) return NextResponse.json({ error: `ترتيب أعمدة CSV غير صالح. استخدم: ${CSV_HEADER.join(',')}` }, { status: 400 })
    const rawItems = rows.slice(1).map((cells) => ({
      id: cells[0], price: cells[4], stock: cells[5],
      condition: cells[6],
      ...(isCurrentHeader ? { category: cells[7], brand: cells[8] } : {}),
    }))
    const result = await validateItems(store.id, rawItems, 2)
    if (result.errors.length) return NextResponse.json({ error: 'يوجد خطأ في الملف ولم يتم حفظ أي صف', errors: result.errors, preview: true }, { status: 400 })
    if (form.get('preview') === '1') return NextResponse.json({ preview: true, valid: result.items.length, errors: [] })
    await applyItems(store.id, result.items)
    await audit({ actorId: session.id, action: 'INVENTORY_CSV_IMPORTED', targetType: 'store', targetId: store.id, metadata: { updated: result.items.length } })
    return NextResponse.json({ ok: true, updated: result.items.length })
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    console.error('Inventory CSV import failed', { error: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'تعذر استيراد الملف' }, { status: 500 })
  }
}
