import { AppShell } from '@/components/app-shell'
import { HomeView } from '@/components/views/home-view'
import { getSession } from '@/lib/auth'

export default async function HomePage() {
  const user = await getSession()
  return (
    <AppShell initialView={{ name: 'home' }} initialUser={user}>
      <HomeView />
    </AppShell>
  )
}
