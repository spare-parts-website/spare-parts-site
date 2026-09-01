'use client'

import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

export function FavoriteStoreButton({
  storeId,
  onChange,
}: {
  storeId: string
  onChange?: (favorite: boolean) => void
}) {
  const user = useAppStore((state) => state.user)
  const toggleFavoriteStore = useAppStore((state) => state.toggleFavoriteStore)
  const favorite = useAppStore((state) => state.favoriteStores.has(storeId))
  const { toast } = useToast()
  const canFavorite = user?.role === 'BUYER' || user?.role === 'SHOP_OWNER'

  if (!canFavorite) return null

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation()
    toggleFavoriteStore(storeId)
    try {
      const url = favorite ? `/api/wishlist?storeId=${encodeURIComponent(storeId)}` : '/api/wishlist'
      const response = await fetch(url, {
        method: favorite ? 'DELETE' : 'POST',
        ...(favorite
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeId }),
            }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'favorite request failed')
      }
      onChange?.(!favorite)
      toast({ title: favorite ? 'تم الحذف من المفضلة' : 'تمت إضافة المتجر للمفضلة' })
    } catch {
      toggleFavoriteStore(storeId)
      toast({ title: 'تعذر تحديث المفضلة', variant: 'destructive' })
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={favorite ? 'إزالة المتجر من المفضلة' : 'إضافة المتجر للمفضلة'}
      className={favorite ? 'text-red-500 border-red-200 bg-red-50' : ''}
      onClick={handleClick}
    >
      <Heart className={`size-4 ${favorite ? 'fill-red-500' : ''}`} />
    </Button>
  )
}
