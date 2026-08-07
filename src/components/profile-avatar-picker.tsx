'use client'

import { useState } from 'react'
import { Check, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PROFILE_AVATARS } from '@/lib/profile-avatars'

export function ProfileAvatarPicker({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selectedAvatar = PROFILE_AVATARS.find((avatar) => avatar.url === value)

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={() => setOpen((current) => !current)} className="gap-2">
        <ImageIcon className="size-4" />
        {open ? 'إخفاء الصور' : 'اختيار صورة من الصور الجاهزة'}
      </Button>
      {selectedAvatar && <p className="text-xs text-muted-foreground">الصورة المختارة: {selectedAvatar.label}</p>}
      {open && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      )}
    </div>
  )
}
