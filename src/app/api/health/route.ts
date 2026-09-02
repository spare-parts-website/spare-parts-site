import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { secretsMatch } from '@/lib/security'
import { aiPaidPrimaryModel, aiProviderTargets } from '@/lib/ai/runtime'
import { providerHealthSnapshot } from '@/lib/ai/provider-health'
import { getTransactionalSender } from '@/lib/email-sender'

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.HEALTHCHECK_SECRET
  if (!expectedSecret || !secretsMatch(req.headers.get('authorization'), `Bearer ${expectedSecret}`)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    await db.$queryRaw`SELECT 1`
    const configuredProviders = aiProviderTargets()
    const health = providerHealthSnapshot()
    const healthyProviders = configuredProviders.filter((provider) => !health.find((item) => item.provider === provider)?.circuitOpen)
    const senderConfigured = Boolean(getTransactionalSender(process.env.NOTIFICATION_FROM_EMAIL, process.env.AUTH_FROM_EMAIL))
    return NextResponse.json(
      {
        ok: true,
        degraded: healthyProviders.length === 0 || !senderConfigured,
        database: 'ok',
        requestId: req.headers.get('x-request-id') || undefined,
        ai: {
          configuredProviders,
          healthyProviders,
          paidPrimaryConfigured: Boolean(aiPaidPrimaryModel()),
        },
        email: {
          resendConfigured: Boolean(process.env.RESEND_API_KEY),
          webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
          senderConfigured,
          supportRecipientConfigured: Boolean(process.env.SUPPORT_EMAIL),
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('Health check failed', error)
    return NextResponse.json(
      { ok: false, database: 'unavailable', requestId: req.headers.get('x-request-id') || undefined },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }
}
