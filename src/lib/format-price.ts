const formatter = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export function formatPrice(price: number): string {
  return formatter.format(price) + ' ج.م'
}
