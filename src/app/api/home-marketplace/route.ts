import { NextResponse } from 'next/server'
import { loadHomeMarketplaceData } from '@/lib/home-marketplace-data'

export const runtime = 'nodejs'
export const revalidate = 120

export async function GET() {
  try {
    const payload = await loadHomeMarketplaceData()
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('Failed to load homepage marketplace payload', error)
    return NextResponse.json({ error: 'تعذر تحميل محتوى السوق' }, { status: 503 })
  }
}
