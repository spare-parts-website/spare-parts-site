import { isProfileAvatar } from '@/lib/profile-avatars'
import { cn } from '@/lib/utils'

export function UserAvatar({ name, src, className, imageClassName }: { name: string; src?: string | null; className?: string; imageClassName?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full border border-primary/20 bg-primary/10 text-primary', className)} aria-label={`صورة ${name}`}>
      {src ? (
        <img src={src} alt={name} className={cn('h-full w-full', isProfileAvatar(src) ? 'object-contain p-0.5' : 'object-cover', imageClassName)} />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold">{name.trim().charAt(0) || '؟'}</span>
      )}
    </span>
  )
}
