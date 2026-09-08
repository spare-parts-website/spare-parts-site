import { runScheduledJob } from './_shared/scheduled-job'

declare const Netlify: { env: { get(name: string): string | undefined } }

export default async function emailRetry() {
  return runScheduledJob({
  path: '/api/jobs/email',
  timeoutMs: 20_000,
  env: (name) => Netlify.env.get(name),
  })
}

export const config = { schedule: '*/5 * * * *' }
