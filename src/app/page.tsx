import { connection } from 'next/server'
import { HomeView } from '@/components/views/home-view'

// Keep this route on the Node runtime and wait for the incoming request so
// Proxy can attach the request-scoped CSP nonce to Next's inline framework
// scripts. Marketplace data remains CDN/cache-backed and below-fold work is
// still deferred, so this avoids weakening CSP without undoing those gains.
export const runtime = 'nodejs'

export default async function HomePage() {
  await connection()
  return <HomeView />
}
