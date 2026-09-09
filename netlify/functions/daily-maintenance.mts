import { runScheduledJob } from './_shared/scheduled-job'

declare const Netlify: { env: { get(name: string): string | undefined } }

export default async function dailyMaintenance() {
  return runScheduledJob({
  path: '/api/ai/cleanup',
  timeoutMs: 25_000,
  env: (name) => Netlify.env.get(name),
  })
}

export const config = { schedule: '0 3 * * *' }
