export const PROFILE_AVATARS = [
  { url: '/profile-avatars/fuel-gauge-car.webp', label: 'عداد وسيارة رياضية' },
  { url: '/profile-avatars/classic-car.webp', label: 'سيارة كلاسيكية' },
  { url: '/profile-avatars/electric-car.webp', label: 'سيارة كهربائية' },
  { url: '/profile-avatars/turbocharger.webp', label: 'شاحن توربيني' },
] as const

export function isProfileAvatar(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_AVATARS.some((avatar) => avatar.url === value)
}
