import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEGP(amount: number): string {
  if (!Number.isFinite(amount)) return '0 ج.م'
  return `${amount.toLocaleString('ar-EG')} ج.م`
}
