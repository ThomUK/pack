/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA fallback so the installed app opens offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/share-target$/] }))

export const SHARE_CACHE = 'pack-share'

// Web Share Target: Android's share sheet POSTs files here. Stash them in a
// cache and send the user to the in-app picker.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return
  event.respondWith(
    (async () => {
      try {
        const fd = await event.request.formData()
        const cache = await caches.open(SHARE_CACHE)
        for (const k of await cache.keys()) await cache.delete(k)
        const files = fd.getAll('files').filter((f): f is File => f instanceof File)
        let i = 0
        for (const f of files) {
          await cache.put(
            `/__share__/${i++}`,
            new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) } }),
          )
        }
        const meta = { title: fd.get('title') ?? '', text: fd.get('text') ?? '', url: fd.get('url') ?? '', count: i, at: Date.now() }
        await cache.put('/__share__/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }))
      } catch {
        /* fall through to the app which will show "nothing shared" */
      }
      return Response.redirect(`${self.registration.scope}#/share`, 303)
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})
