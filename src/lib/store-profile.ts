import 'server-only'

import { normalizeEgyptianMobile } from '@/lib/egyptian-phone'
import { isPublicUploadUrl } from '@/lib/storage-url'

type CurrentStoreProfile = { name: string; description: string | null; address: string | null; phone: string | null; image: string | null }
export type StoreProfile = CurrentStoreProfile

function optionalText(value: unknown, current: string | null, max: number) {
  if (value === undefined) return current
  if (value === null) return null
  if (typeof value !== 'string') throw new Error('INVALID_STORE_PROFILE')
  const clean = value.trim()
  if (!clean) return null
  if (clean.length > max) throw new Error('INVALID_STORE_PROFILE')
  return clean
}

export function parseStoreProfileInput(current: CurrentStoreProfile, body: Record<string, unknown>): StoreProfile {
  const name = body.name === undefined ? current.name : typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 120) throw new Error('INVALID_STORE_NAME')
  const description = optionalText(body.description, current.description, 2000)
  const address = optionalText(body.address, current.address, 300)

  let phone = current.phone
  if (body.phone !== undefined) {
    if (body.phone === null || body.phone === '') phone = null
    else if (typeof body.phone !== 'string') throw new Error('INVALID_STORE_PHONE')
    else {
      const normalized = normalizeEgyptianMobile(body.phone.trim())
      if (!normalized) throw new Error('INVALID_STORE_PHONE')
      phone = normalized
    }
  }

  let image = current.image
  if (body.image !== undefined) {
    if (body.image === null || body.image === '') image = null
    else if (!isPublicUploadUrl(body.image)) throw new Error('INVALID_STORE_IMAGE')
    else image = body.image
  }
  return { name, description, address, phone, image }
}

function normalized(value: string | null) { return value?.trim() || null }
export function storeIdentityChanged(current: CurrentStoreProfile, next: StoreProfile) {
  return current.name.trim() !== next.name.trim() || normalized(current.phone) !== normalized(next.phone) || normalized(current.address) !== normalized(next.address) || normalized(current.image) !== normalized(next.image)
}

export function storeProfileErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'INVALID_STORE_NAME') return 'اسم المتجر يجب أن يكون بين حرفين و120 حرفاً'
  if (code === 'INVALID_STORE_PHONE') return 'رقم موبايل المتجر المصري غير صالح'
  if (code === 'INVALID_STORE_IMAGE') return 'صورة المتجر يجب أن تكون من تخزين غيار ماركت فقط'
  return 'بيانات المتجر غير صالحة أو تتجاوز الحد المسموح'
}
