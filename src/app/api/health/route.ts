import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { secretsMatch } from '@/lib/security'
import { aiPaidPrimaryModel, aiProviderTargets } from '@/lib/ai/runtime'
import { providerHealthSnapshot, sharedProviderHealthSnapshot } from '@/lib/ai/provider-health'
import { getTransactionalSender } from '@/lib/email-sender'

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.HEALTHCHECK_SECRET
  if (!expectedSecret || !secretsMatch(req.headers.get('authorization'), `Bearer ${expectedSecret}`)) return new NextResponse(null, { status: 404 })

  try {
    await db.$queryRaw`SELECT 1`
    const configuredProviders = aiProviderTargets()
    const [localHealth, sharedHealth] = await Promise.all([Promise.resolve(providerHealthSnapshot()), sharedProviderHealthSnapshot()])
    const sharedByProvider = new Map(sharedHealth.map((item) => [item.provider, item]))
    const healthyProviders = configuredProviders.filter((provider) => {
      const shared = sharedByProvider.get(provider)
      if (shared && !shared.stale) return !shared.circuitOpen && shared.status !== 'OPEN'
      return !localHealth.find((item) => item.provider === provider)?.circuitOpen
    })
    const staleSharedProviders = sharedHealth.filter((item) => item.stale).map((item) => item.provider)
    const senderConfigured = Boolean(getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL))
    return NextResponse.json({
      ok: true,
      degraded: healthyProviders.length === 0 || !senderConfigured || staleSharedProviders.length > 0,
      database: 'ok', requestId: req.headers.get('x-request-id') || undefined,
      ai: { configuredProviders, healthyProviders, paidPrimaryConfigured: Boolean(aiPaidPrimaryModel()), local: localHealth, shared: sharedHealth, staleSharedProviders },
      email: { resendConfigured: Boolean(process.env.RESEND_API_KEY), webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET), senderConfigured, supportRecipientConfigured: Boolean(process.env.SUPPORT_EMAIL) },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Health check failed', error)
    return NextResponse.json({ ok: false, database: 'unavailable', requestId: req.headers.get('x-request-id') || undefined }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
