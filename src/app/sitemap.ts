import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

const baseUrl = process.env.APP_URL || 'https://ghyarmarket-eg.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/parts', '/stores', '/privacy', '/terms', '/returns', '/contact']
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: path === '' ? 'daily' : 'weekly', priority: path === '' ? 1 : 0.7 }))
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) return entries
  try {
    const [parts, stores] = await Promise.all([
      db.part.findMany({ where: { moderationStatus: 'ACTIVE', store: { moderationStatus: 'ACTIVE' } }, select: { id: true, updatedAt: true } }),
      db.store.findMany({ where: { moderationStatus: 'ACTIVE', parts: { some: { moderationStatus: 'ACTIVE' } } }, select: { id: true, updatedAt: true } }),
    ])
    entries.push(...parts.map((part) => ({ url: `${baseUrl}/parts/${part.id}`, lastModified: part.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })))
    entries.push(...stores.map((store) => ({ url: `${baseUrl}/stores/${store.id}`, lastModified: store.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })))
  } catch {}
  return entries
}
