type JobOptions = {
  path: '/api/jobs/email' | '/api/ai/cleanup'
  timeoutMs: number
  env: (name: string) => string | undefined
  request?: typeof fetch
}

export async function runScheduledJob({ path, timeoutMs, env, request = fetch }: JobOptions) {
  if (env('JOBS_ENABLED') !== '1') return new Response(null, { status: 204 })
  const origin = env('APP_URL')
  const secret = env('CRON_SECRET')
  if (!origin || !secret) return new Response('Scheduler not configured', { status: 503 })
  let url: URL
  try {
    url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return new Response('A clean HTTPS origin is required', { status: 503 })
    }
    url.pathname = path
  } catch {
    return new Response('Invalid scheduler origin', { status: 503 })
  }
  try {
    const response = await request(url, {
      headers: { authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    // Do not echo potentially private upstream responses.
    return new Response(null, { status: response.ok ? 204 : 503 })
  } catch {
    return new Response('Scheduled job unavailable', { status: 503 })
  }
}
