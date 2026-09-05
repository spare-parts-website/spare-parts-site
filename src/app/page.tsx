import { HomeView } from '@/components/views/home-view'

// The homepage HTML no longer waits on Postgres. Marketplace cards are loaded
// through a small CDN-cached public payload. Keep the page on the Node runtime:
// the shared application shell exceeds the Hobby-plan Edge Function size limit,
// while Vercel still runs the server-rendered request in the project's dub1 region.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <HomeView />
}
