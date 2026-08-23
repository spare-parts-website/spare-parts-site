export const IMAGE_UPLOAD_MAX_INPUT_BYTES = 4 * 1024 * 1024
export const IMAGE_UPLOAD_MAX_OUTPUT_BYTES = 1024 * 1024
export const IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_TYPES.join(',')

export type ImagePurpose = 'avatar' | 'store' | 'part' | 'chat' | 'evidence' | 'verification'

export const IMAGE_PURPOSES: Record<ImagePurpose, { width: number; height: number; quality: number }> = {
  avatar: { width: 512, height: 512, quality: 80 },
  store: { width: 1280, height: 1280, quality: 82 },
  part: { width: 1600, height: 1600, quality: 82 },
  chat: { width: 1280, height: 1280, quality: 78 },
  evidence: { width: 1600, height: 1600, quality: 80 },
  verification: { width: 1600, height: 1600, quality: 82 },
}

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return typeof value === 'string' && value in IMAGE_PURPOSES
}
