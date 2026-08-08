import { create } from 'zustand'

export type UserRole = 'BUYER' | 'ADMIN' | 'SHOP_OWNER'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  phone?: string | null
  avatar?: string | null
}

export type View =
  | { name: 'home' }
  | { name: 'stores' }
  | { name: 'store'; storeId: string }
  | { name: 'parts' }
  | { name: 'part'; partId: string }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'orders' }
  | { name: 'profile' }
  | { name: 'inbox' }
  | { name: 'legal'; page: 'privacy' | 'terms' | 'returns' | 'contact' }
  | { name: 'shop-dashboard'; tab?: 'parts' | 'orders' | 'store' | 'analytics' | 'coupons' | 'messages' }
  | { name: 'admin-dashboard'; tab?: 'users' | 'parts' | 'orders' | 'reviews' | 'stores' | 'reports' }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'wishlist' }
  | { name: 'chat'; orderId: string }
  | { name: 'chat'; partId: string; participantId?: string }

const VIEW_HISTORY_KEY = '__sparePartsView'

function pushViewToBrowserHistory(view: View) {
  if (typeof window === 'undefined') return

  const currentView = window.history.state?.[VIEW_HISTORY_KEY] as View | undefined
  if (JSON.stringify(currentView) === JSON.stringify(view)) return

  window.history.pushState(
    { ...window.history.state, [VIEW_HISTORY_KEY]: view },
    '',
    window.location.href,
  )
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
}

interface AppState {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void

  view: View
  setView: (v: View) => void

  // For returning to previous view after auth
  pendingView: View | null
  setPendingView: (v: View | null) => void

  searchQuery: string
  setSearchQuery: (q: string) => void

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

  view: { name: 'home' },
  setView: (v) => {
    pushViewToBrowserHistory(v)
    set({ view: v })
  },

  pendingView: null,
  setPendingView: (v) => set({ pendingView: v }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

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
