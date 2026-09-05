import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { isBlockedStoreName } from '@/lib/store-moderation'

const baseUrl = process.env.APP_URL || 'https://ghyarmarket-eg.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/parts', '/stores', '/privacy', '/terms', '/returns', '/contact']
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: path === '' ? 'daily' : 'weekly', priority: path === '' ? 1 : 0.7 }))
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) return entries
  try {
    const [parts, stores] = await Promise.all([
      db.part.findMany({ where: { blocked: false }, select: { id: true, updatedAt: true } }),
      db.store.findMany({ where: { parts: { some: { blocked: false } } }, select: { id: true, name: true, updatedAt: true } }),
    ])
    entries.push(...parts.map((part) => ({ url: `${baseUrl}/parts/${part.id}`, lastModified: part.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })))
    entries.push(...stores.filter((store) => !isBlockedStoreName(store.name)).map((store) => ({ url: `${baseUrl}/stores/${store.id}`, lastModified: store.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })))
  } catch {
    // Static pages remain discoverable if the database is temporarily unavailable.
  }
  return entries
}
