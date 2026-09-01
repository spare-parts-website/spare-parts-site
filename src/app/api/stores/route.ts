import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPublicStore, getPublicStoresList } from '@/lib/public-marketplace'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const id = searchParams.get('id')

    if (id) {
      const viewerRequested = searchParams.get('viewer') === '1'
      const result = await getPublicStore(id, viewerRequested ? await getSession() : null)
      if (!result.store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': viewerRequested ? 'private, no-store, max-age=0' : 'public, s-maxage=30, stale-while-revalidate=120' } })
    }
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const result = await getPublicStoresList(search, requestedPage)
    return NextResponse.json(
      result,
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'تعذر تحميل المتاجر' }, { status: 500 })
  }
}
