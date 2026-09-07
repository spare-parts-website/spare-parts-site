import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { purgeExpiredAIData } from '@/lib/ai/history'
import { cleanupEmailQueueHistory, processEmailOutboxBatch } from '@/lib/email-outbox'
import { runSyntheticProviderHealth } from '@/lib/ai/synthetic-health'
import { notifyOperationalAlert } from '@/lib/operational-alerts'
import { secretsMatch } from '@/lib/security'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || !secretsMatch(request.headers.get('authorization'), `Bearer ${secret}`)) return new NextResponse(null, { status: 404 })

  const [ai, email, rateBuckets, loginChallenges, passwordResets, adminChallenges, emailChanges] = await Promise.all([
    purgeExpiredAIData({ global: true }),
    processEmailOutboxBatch(100),
    db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    db.loginVerification.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    db.adminMfaChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    db.emailChangeRequest.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
  ])
  const emailHistory = await cleanupEmailQueueHistory()
  const providerHealth = await runSyntheticProviderHealth()
  if (providerHealth.results.length > 0 && !providerHealth.ok) {
    await notifyOperationalAlert('ai.providers.unavailable', { providers: providerHealth.results.length, failed: providerHealth.results.filter((item) => !item.ok).length })
  }

  return NextResponse.json({
    ok: true,
    conversationsDeleted: ai.count,
    email,
    providerHealth,
    cleanup: {
      rateBuckets: rateBuckets.count,
      loginChallenges: loginChallenges.count,
      passwordResets: passwordResets.count,
      adminChallenges: adminChallenges.count,
      emailChanges: emailChanges.count,
      emailHistory,
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
