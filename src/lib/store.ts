import { create } from 'zustand'
import type { FitmentStatus } from '@/lib/vehicle-compatibility'

export type UserRole = 'BUYER' | 'ADMIN' | 'SHOP_OWNER'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  phone?: string | null
  avatar?: string | null
  emailNotifications?: boolean
}

export type View =
  | { name: 'home' }
  | { name: 'stores' }
  | { name: 'store'; storeId: string }
  | { name: 'parts' }
  | { name: 'part'; partId: string }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'forgot-password' }
  | { name: 'reset-password' }
  | { name: 'orders' }
  | { name: 'profile' }
  | { name: 'inbox' }
  | { name: 'support' }
  | { name: 'legal'; page: 'privacy' | 'terms' | 'returns' | 'contact' }
  | { name: 'shop-dashboard'; tab?: 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages' }
  | { name: 'admin-dashboard'; tab?: 'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports' | 'support' }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'wishlist' }
  | { name: 'chat'; orderId: string }
  | { name: 'chat'; partId: string; participantId?: string }

export function viewToPath(view: View, searchQuery = ''): string {
  switch (view.name) {
    case 'home':
      return '/'
    case 'stores':
      return '/stores'
    case 'store':
      return `/stores/${encodeURIComponent(view.storeId)}`
    case 'parts':
      return searchQuery ? `/parts?search=${encodeURIComponent(searchQuery)}` : '/parts'
    case 'part':
      return `/parts/${encodeURIComponent(view.partId)}`
    case 'login':
      return '/login'
    case 'register':
      return '/register'
    case 'forgot-password':
      return '/forgot-password'
    case 'reset-password':
      return '/reset-password'
    case 'orders':
      return '/account/orders'
    case 'profile':
      return '/account/profile'
    case 'inbox':
      return '/account/messages'
    case 'support':
      return '/support'
    case 'legal':
      return `/${view.page}`
    case 'shop-dashboard':
      return `/seller/${view.tab || 'parts'}`
    case 'admin-dashboard':
      return `/admin/${view.tab || 'users'}`
    case 'cart':
      return '/cart'
    case 'checkout':
      return '/checkout'
    case 'wishlist':
      return '/account/wishlist'
    case 'chat':
      if ('orderId' in view) return `/messages/order/${encodeURIComponent(view.orderId)}`
      return `/messages/part/${encodeURIComponent(view.partId)}${view.participantId ? `?participant=${encodeURIComponent(view.participantId)}` : ''}`
  }
}

export interface CartItem {
  partId: string
  name: string
  price: number
  image?: string | null
  storeId: string
  storeName: string
  quantity: number
  stock: number
  fitmentStatus?: FitmentStatus
  fitmentCarLabel?: string | null
}

interface AppState {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void

  // For returning to previous view after auth
  pendingView: View | null
  setPendingView: (v: View | null) => void

  // Cart
  cart: CartItem[]
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  removeFromCart: (partId: string) => void
  updateCartQuantity: (partId: string, quantity: number) => void
  clearCart: () => void

  // Notifications
  notificationCount: number
  setNotificationCount: (n: number) => void

  // Wishlist
  favoriteStores: Set<string>
  toggleFavoriteStore: (storeId: string) => void
  setFavoriteStores: (ids: string[]) => void
  isFavoriteStore: (storeId: string) => boolean
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),

  pendingView: null,
  setPendingView: (v) => set({ pendingView: v }),

  cart: [],
  cartOpen: false,
  setCartOpen: (open) => set({ cartOpen: open }),
  addToCart: (item, quantity = 1) =>
    set((state) => {
      const existing = state.cart.find((c) => c.partId === item.partId)
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, item.stock)
        return {
          cart: state.cart.map((c) =>
            c.partId === item.partId ? { ...c, quantity: newQty } : c
          ),
          cartOpen: true,
        }
      }
      return {
        cart: [...state.cart, { ...item, quantity: Math.min(quantity, item.stock) }],
        cartOpen: true,
      }
    }),
  removeFromCart: (partId) =>
    set((state) => ({ cart: state.cart.filter((c) => c.partId !== partId) })),
  updateCartQuantity: (partId, quantity) =>
    set((state) => ({
      cart: state.cart.map((c) =>
        c.partId === partId
          ? { ...c, quantity: Math.max(1, Math.min(quantity, c.stock)) }
          : c
      ),
    })),
  clearCart: () => set({ cart: [] }),

  notificationCount: 0,
  setNotificationCount: (n) => set({ notificationCount: n }),

  favoriteStores: new Set<string>(),
  toggleFavoriteStore: (storeId) =>
    set((state) => {
      const newFavorites = new Set(state.favoriteStores)
      if (newFavorites.has(storeId)) newFavorites.delete(storeId)
      else newFavorites.add(storeId)
      return { favoriteStores: newFavorites }
    }),
  setFavoriteStores: (ids) => set({ favoriteStores: new Set(ids) }),
  isFavoriteStore: (storeId) => useAppStore.getState().favoriteStores.has(storeId),
}))
