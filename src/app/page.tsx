import { HomeView } from '@/components/views/home-view'

// The homepage HTML no longer waits on Postgres. Marketplace cards are loaded
// through a small CDN-cached public payload, so this request can use the global
// Edge runtime while the database-facing API stays pinned beside Supabase.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <HomeView />
}
