// Offline cache of the data repo, keyed by file path, in IndexedDB.
import { createStore, get, set, del, keys, clear } from 'idb-keyval'

const docs = createStore('pack-docs', 'docs')
const meta = createStore('pack-meta', 'meta')

export interface CachedDoc<T = unknown> {
  path: string
  sha: string
  data: T
  cachedAt: string
}

export async function cacheGet<T>(path: string): Promise<CachedDoc<T> | undefined> {
  try {
    return await get<CachedDoc<T>>(path, docs)
  } catch {
    return undefined
  }
}

export async function cacheSet<T>(path: string, sha: string, data: T): Promise<void> {
  try {
    await set(path, { path, sha, data, cachedAt: new Date().toISOString() } satisfies CachedDoc<T>, docs)
  } catch {
    /* storage unavailable; ignore */
  }
}

export async function cacheDel(path: string): Promise<void> {
  try {
    await del(path, docs)
  } catch {
    /* ignore */
  }
}

export async function cacheKeys(): Promise<string[]> {
  try {
    return (await keys(docs)) as string[]
  } catch {
    return []
  }
}

export async function cacheClearAll(): Promise<void> {
  try {
    await clear(docs)
    await clear(meta)
  } catch {
    /* ignore */
  }
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, meta)
  } catch {
    return undefined
  }
}

export async function metaSet<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value, meta)
  } catch {
    /* ignore */
  }
}

// ── attachment bytes kept for offline use (Cache API) ────────────────────────

const FILE_CACHE = 'pack-files-v1'

export async function fileCachePut(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  if (typeof caches === 'undefined') return
  const c = await caches.open(FILE_CACHE)
  await c.put(fileCacheKey(path), new Response(bytes as BufferSource, { headers: { 'Content-Type': mime } }))
}

export async function fileCacheGet(path: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null
  const c = await caches.open(FILE_CACHE)
  const r = await c.match(fileCacheKey(path))
  return r ? await r.blob() : null
}

export async function fileCacheDelete(path: string): Promise<void> {
  if (typeof caches === 'undefined') return
  const c = await caches.open(FILE_CACHE)
  await c.delete(fileCacheKey(path))
}

export async function fileCacheHas(path: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const c = await caches.open(FILE_CACHE)
  return !!(await c.match(fileCacheKey(path)))
}

function fileCacheKey(path: string): string {
  return `/__pack_file__/${encodeURIComponent(path)}`
}
