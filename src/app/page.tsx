import { AppShell } from '@/components/app-shell'
import { HomeView } from '@/components/views/home-view'

export default function HomePage() {
  return (
    <AppShell initialView={{ name: 'home' }}>
      <HomeView />
    </AppShell>
  )
}
