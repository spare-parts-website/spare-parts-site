const BUCKET = 'uploads'
const PRIVATE_BUCKET = 'protected-uploads'

function getStorageObjectPath(value: string) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  if (!base || !value) return null
  try {
    const url = new URL(value)
    if (url.origin !== base) return null
    const prefix = `/storage/v1/object/public/${BUCKET}/`
    if (!url.pathname.startsWith(prefix)) return null
    const path = decodeURIComponent(url.pathname.slice(prefix.length))
    if (!path || path.includes('..') || path.includes('\\')) return null
    return path
  } catch {
    return null
  }
}

/** Best-effort cleanup for objects owned by the application. Database deletion
 * remains authoritative, so a temporary Storage failure never breaks a delete. */
export async function deleteUploadedFiles(urls: Array<string | null | undefined>) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  if (!serviceRoleKey || !base) return
  const objects = urls.flatMap((url) => {
    if (typeof url !== 'string') return []
    const publicPath = getStorageObjectPath(url)
    if (publicPath) return [{ bucket: BUCKET, path: publicPath }]
    if (url.startsWith('/api/private-image?path=')) {
      const path = decodeURIComponent(url.slice('/api/private-image?path='.length))
      if (path && !path.includes('..') && !path.includes('\\')) return [{ bucket: PRIVATE_BUCKET, path }]
    }
    return []
  })
  const unique = Array.from(new Map(objects.map((item) => [`${item.bucket}/${item.path}`, item])).values())
  await Promise.allSettled(unique.map(async ({ bucket, path }) => {
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    })
    if (!response.ok && response.status !== 404) throw new Error(`Storage cleanup failed: ${response.status}`)
  }))
}
