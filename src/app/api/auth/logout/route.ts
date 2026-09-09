import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

export async function POST() {
  try {
    await destroySession()
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'تعذر تسجيل الخروج. حاول مرة أخرى.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } })
  }
}
