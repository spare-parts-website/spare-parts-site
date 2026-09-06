import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { purgeExpiredAIData } from '@/lib/ai/history'
import { cleanupEmailQueueHistory, processEmailOutboxBatch } from '@/lib/email-outbox'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

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

  return NextResponse.json({
    ok: true,
    conversationsDeleted: ai.count,
    email,
    cleanup: {
      rateBuckets: rateBuckets.count,
      loginChallenges: loginChallenges.count,
      passwordResets: passwordResets.count,
      adminChallenges: adminChallenges.count,
      emailChanges: emailChanges.count,
      emailHistory,
    },
  })
}
