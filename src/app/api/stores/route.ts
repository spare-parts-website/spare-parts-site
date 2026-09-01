import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPublicStore, getPublicStoresList } from '@/lib/public-marketplace'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const id = searchParams.get('id')

    if (id) {
      const result = await getPublicStore(id, await getSession())
      if (!result.store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
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
