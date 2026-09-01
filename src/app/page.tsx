import { HomeView } from '@/components/views/home-view'

// Anonymous marketplace data may be regenerated independently of auth state.
// Keep the window short so inventory changes appear without embedding cookies
// or user identity in the shared HTML cache.
export const revalidate = 30

export default async function HomePage() {
  return <HomeView />
}
