'use client'

import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAppStore, type View } from '@/lib/store'

export function FavoriteStoreButton({ storeId, returnView }: { storeId: string; returnView: View }) {
  const { user, setView, setPendingView, toggleFavoriteStore, isFavoriteStore } = useAppStore()
  const { toast } = useToast()
  const favorite = isFavoriteStore(storeId)

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!user) {
      setPendingView(returnView)
      setView({ name: 'login' })
      return
    }

    toggleFavoriteStore(storeId)
    try {
      const response = await fetch('/api/wishlist', {
        method: favorite ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      if (!response.ok) throw new Error('favorite request failed')
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
