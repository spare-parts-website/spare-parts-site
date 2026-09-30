import { NextResponse } from 'next/server'
import { purgeExpiredAIData } from '@/lib/ai/history'
import { secretsMatch } from '@/lib/security'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || !secretsMatch(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }
  const result = await purgeExpiredAIData()
  return NextResponse.json({ ok: true, conversationsDeleted: result.count })
}
