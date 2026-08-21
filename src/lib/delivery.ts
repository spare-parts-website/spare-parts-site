export const GOVERNORATE_DELIVERY = {
  Cairo: { ar: 'القاهرة', fee: 70, days: 2 }, Giza: { ar: 'الجيزة', fee: 70, days: 2 },
  Alexandria: { ar: 'الإسكندرية', fee: 90, days: 3 }, Dakahlia: { ar: 'الدقهلية', fee: 95, days: 3 },
  Sharqia: { ar: 'الشرقية', fee: 95, days: 3 }, Qalyubia: { ar: 'القليوبية', fee: 80, days: 2 },
  Gharbia: { ar: 'الغربية', fee: 95, days: 3 }, Monufia: { ar: 'المنوفية', fee: 95, days: 3 },
  Beheira: { ar: 'البحيرة', fee: 100, days: 4 }, KafrElSheikh: { ar: 'كفر الشيخ', fee: 105, days: 4 },
  Damietta: { ar: 'دمياط', fee: 105, days: 4 }, PortSaid: { ar: 'بورسعيد', fee: 105, days: 4 },
  Ismailia: { ar: 'الإسماعيلية', fee: 100, days: 3 }, Suez: { ar: 'السويس', fee: 100, days: 3 },
  Fayoum: { ar: 'الفيوم', fee: 105, days: 4 }, BeniSuef: { ar: 'بني سويف', fee: 110, days: 4 },
  Minya: { ar: 'المنيا', fee: 120, days: 5 }, Assiut: { ar: 'أسيوط', fee: 125, days: 5 },
  Sohag: { ar: 'سوهاج', fee: 130, days: 5 }, Qena: { ar: 'قنا', fee: 135, days: 6 },
  Luxor: { ar: 'الأقصر', fee: 140, days: 6 }, Aswan: { ar: 'أسوان', fee: 150, days: 7 },
  RedSea: { ar: 'البحر الأحمر', fee: 150, days: 7 }, Matrouh: { ar: 'مطروح', fee: 145, days: 6 },
  NorthSinai: { ar: 'شمال سيناء', fee: 160, days: 7 }, SouthSinai: { ar: 'جنوب سيناء', fee: 160, days: 7 },
  NewValley: { ar: 'الوادي الجديد', fee: 170, days: 8 },
} as const

export type GovernorateCode = keyof typeof GOVERNORATE_DELIVERY
export function deliveryQuote(code: unknown) {
  if (typeof code !== 'string' || !(code in GOVERNORATE_DELIVERY)) return null
  const item = GOVERNORATE_DELIVERY[code as GovernorateCode]
  return { ...item, code: code as GovernorateCode, estimatedAt: new Date(Date.now() + item.days * 86400000) }
}
