'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROFILE_AVATARS } from '@/lib/profile-avatars'

export function ProfileAvatarPicker({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {PROFILE_AVATARS.map((avatar) => {
        const selected = value === avatar.url
        return (
          <button
            key={avatar.url}
            type="button"
            onClick={() => onChange(avatar.url)}
            aria-label={`اختيار صورة ${avatar.label}`}
            aria-pressed={selected}
            className={cn(
              'relative aspect-square overflow-hidden rounded-xl border-2 bg-muted/30 p-1 transition hover:border-primary/60',
              selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
            )}
          >
            <img src={avatar.url} alt={avatar.label} className="h-full w-full object-contain" />
            {selected && (
              <span className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
