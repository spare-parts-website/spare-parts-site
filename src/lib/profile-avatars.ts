export const PROFILE_AVATARS = [
  { url: '/istockphoto-1331164968-612x612.png', label: 'سيارة ومحطة وقود' },
  { url: '/profile-turbo.png', label: 'شاحن توربيني' },
  { url: '/profile-car.png', label: 'سيارة رياضية' },
  { url: '/profile-electric-car.png', label: 'سيارة كهربائية' },
] as const

export function isProfileAvatar(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_AVATARS.some((avatar) => avatar.url === value)
}
