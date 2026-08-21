export const PROFILE_AVATARS = [
  { url: '/profile-avatars/fuel-gauge-car.png', label: 'عداد وسيارة رياضية' },
  { url: '/profile-avatars/classic-car.png', label: 'سيارة كلاسيكية' },
  { url: '/profile-avatars/electric-car.png', label: 'سيارة كهربائية' },
  { url: '/profile-avatars/turbocharger.png', label: 'شاحن توربيني' },
] as const

export function isProfileAvatar(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_AVATARS.some((avatar) => avatar.url === value)
}
