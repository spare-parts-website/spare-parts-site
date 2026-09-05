import { HomeView } from '@/components/views/home-view'

// This route contains no request-specific data. Keeping the Node runtime is
// harmless for build compatibility, while the absence of force-dynamic allows
// Next/Vercel to prerender and CDN-serve the homepage instead of invoking a
// function for every anonymous request.
export const runtime = 'nodejs'

export default function HomePage() {
  return <HomeView />
}
