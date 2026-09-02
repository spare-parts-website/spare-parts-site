/**
 * Small, deliberately conservative normalisation helpers shared by the
 * planner and deterministic parser.  These helpers only normalise words for
 * intent matching; the original query is preserved when it is sent to the
 * marketplace search so a seller's spelling is not silently rewritten.
 */

const ARABIC_MARKS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g
const VEHICLE_MAKES = /(?:bmw|مرسيدس|mercedes(?:-benz)?|toyota|تويوتا|hyundai|هيونداي|kia|كيا|nissan|نيسان|honda|هوندا|ford|فورد|volkswagen|vw|فولكس|chevrolet|شيفروليه|mitsubishi|ميتسوبيشي|audi|اودي|أودي|volvo|فولفو|skoda|سكودا|peugeot|بيجو|renault|رينو)/i

export function normalizeAIText(value: string) {
  return value
    .normalize('NFKC')
    .replace(ARABIC_MARKS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .toLocaleLowerCase('ar-EG')
    .replace(/[،,:؛]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A sale/availability phrase always wins over compatibility language. */
export function isMarketplaceAvailabilityRequest(value: string) {
  const text = normalizeAIText(value)
  return /(?:للبيع|بيع|موجود|موجوده|متاح|متاحه|اعرض|عرض|هات|show|available|for sale|buy|purchase|شراء|اشتري|عايز اشتري|اريد شراء)/i.test(text)
}

export function isMarketplaceTerm(value: string) {
  const text = normalizeAIText(value)
  return /(?:دور|ابحث|فتش|عايز|اريد|هات|للبيع|بيع|موجود|متاح|اعرض|عرض|شراء|اشتري|عداد|محرك|موتور|فرامل|تيل|فلتر|كشاف|طلمبة|جنط|جنوط|engine|engin|motor|moter|brake|part|parts|offer|listing|sale|find|search|store|shop|wheel|whell|rim)/i.test(text)
}

export function isPartsBrowseRequest(value: string) {
  const text = normalizeAIText(value)
  return /^(?:اعرض|هات|وريني|شوف|show|list|display)(?:\s+(?:لي|ليا|ال)?(?:القطع|قطع(?:\s+الغيار)?|parts?))?$/i.test(text)
}

export function isPurchaseRequest(value: string) {
  const text = normalizeAIText(value)
  return /(?:شراء|اشتري|اشترى|عايز\s+اشتري|اريد\s+شراء|اريد\s+اشتري|buy|purchase|add\s+(?:it|one|the first)|اضف.*(?:السله|السلة|cart)|ضيف.*(?:السله|السلة|cart))/i.test(text)
}

export function hasVehicleReference(value: string) {
  const text = normalizeAIText(value)
  if (!VEHICLE_MAKES.test(text)) return false
  // A make on its own is not enough. Require a model/year token after it so a
  // generic “BMW parts” sale request cannot become a compatibility lookup.
  return new RegExp(`${VEHICLE_MAKES.source}\\s+[\\p{L}\\p{N}-]+`, 'iu').test(text)
}

export function isExplicitFitmentRequest(value: string) {
  const text = normalizeAIText(value)
  if (isMarketplaceAvailabilityRequest(text) || !hasVehicleReference(text)) return false
  return /(?:متوافق|ينفع|يركب|توافق|compatible|fitment|fits?|fit\s+on|fit\s+for)/i.test(text)
}

export function containsInteractiveInstruction(value: string) {
  return /(?:اضغط|انقر|انقر هنا|اضغط هنا|click|press|tap|apply|طب[ّ]?ق|نف[ّ]?ذ|execute).{0,60}(?:زر|button|هنا|here|تأكيد|confirm|اختيار|select|apply|تنفيذ)/i.test(value)
}

export function hasUnsupportedFactLanguage(value: string) {
  return /(?:متوفر|متاحة|متاح|للبيع|السعر|سعره|جنيه|ج\.م|مخزون|stock|price|compatible|متوافق|يركب|ينفع)/i.test(value)
}
