import { NextResponse } from 'next/server'
import { purgeExpiredAIData } from '@/lib/ai/history'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const result = await purgeExpiredAIData()
  return NextResponse.json({ ok: true, conversationsDeleted: result.count })
}
