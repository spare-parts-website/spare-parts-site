import { NextResponse } from 'next/server'
import { processEmailOutboxBatch } from '@/lib/email-outbox'
import { secretsMatch } from '@/lib/security'

/** Independent queue recovery; daily maintenance is not an email scheduler. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || !secretsMatch(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return new NextResponse(null, { status: 404 })
  }
  const result = await processEmailOutboxBatch(20)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
