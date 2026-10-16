// Read files handed over by the service worker's share-target handler.
const SHARE_CACHE = 'pack-share'

export interface SharedPayload {
  title: string
  text: string
  url: string
  files: File[]
}

export async function readSharedPayload(): Promise<SharedPayload | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(SHARE_CACHE)
  const metaRes = await cache.match('/__share__/meta')
  if (!metaRes) return null
  const meta = (await metaRes.json()) as { title: string; text: string; url: string; count: number }
  const files: File[] = []
  for (let i = 0; i < meta.count; i++) {
    const r = await cache.match(`/__share__/${i}`)
    if (!r) continue
    const name = decodeURIComponent(r.headers.get('X-File-Name') ?? `shared-${i}`)
    const type = r.headers.get('Content-Type') ?? 'application/octet-stream'
    files.push(new File([await r.blob()], name, { type }))
  }
  return { title: meta.title, text: meta.text, url: meta.url, files }
}

export async function clearSharedPayload(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(SHARE_CACHE)
}
