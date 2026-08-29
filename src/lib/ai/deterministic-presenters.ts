import type { AIToolCard } from './types.ts'

export type SellerInventoryPart = {
  id: string
  name: string
  price: number
  stock: number
  blocked: boolean
}

export function presentSellerInventory(input: {
  storeName: string
  totalParts: number
  lowStockCount: number
  parts: SellerInventoryPart[]
  focus: 'low_stock' | 'out_of_stock'
}): AIToolCard {
  const matching = input.focus === 'out_of_stock' ? input.parts.filter((part) => part.stock === 0) : input.parts.filter((part) => part.stock <= 3)
  const items = matching.slice(0, 20).map((part) => ({
    id: `part-${part.id}`,
    title: part.name,
    subtitle: `${part.stock === 0 ? 'نفد من المخزون' : `متبقي ${part.stock}`} • ${part.blocked ? 'محظورة' : 'نشطة'}`,
    value: `${part.price.toLocaleString('ar-EG')} ج.م`,
    select: { kind: 'part' as const, id: part.id, label: part.name },
  }))
  if (input.focus === 'out_of_stock') return {
    type: 'insight',
    title: 'القطع النافدة من المخزون',
    description: matching.length ? `وجدت ${matching.length} قطعة مخزونها صفر. أعد توفيرها أو عطّل عرضها إذا لم تعد متاحة.` : `لا توجد قطع مخزونها صفر حالياً في ${input.storeName}.`,
    items,
  }
  return {
    type: 'insight',
    title: 'القطع منخفضة المخزون',
    description: input.lowStockCount ? `وجدت ${input.lowStockCount} من أصل ${input.totalParts} قطعة عند حد التنبيه (3 قطع أو أقل)، مرتبة من الأقل مخزوناً. أعرض أول ${items.length} نتيجة.` : `لا توجد قطع عند حد التنبيه حالياً؛ كل قطع ${input.storeName} لديها أكثر من 3 وحدات في المخزون.`,
    items,
  }
}
