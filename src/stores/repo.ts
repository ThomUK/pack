// The data repo as reactive documents. Loads via one tree request, diffing shas
// against what we hold, and keeps an offline copy in IndexedDB.
import { defineStore } from 'pinia'
import { ref, computed, shallowReactive, markRaw } from 'vue'
import { useConfigStore } from './config'
import { useUiStore } from './ui'
import { Doc, type Op, type SaveState } from '@/lib/doc'
import { getTree, getTextFile, putFile, deleteFile, getRawFile, getFileSha, GitHubError, OfflineError, type RepoConfig } from '@/lib/github'
import { cacheGet, cacheSet, cacheDel, cacheKeys, cacheClearAll, fileCachePut, fileCacheGet, fileCacheDelete, fileCacheHas } from '@/lib/cache'
import type { Family, Trip, TripTemplate, PackingList, Attachment } from '@/lib/models'
import { STARTER_TEMPLATES } from '@/lib/starter-templates'
import { tripOps } from '@/lib/ops'
import { uid, nowIso, slugify } from '@/lib/ids'

export type RepoStatus = 'unconfigured' | 'loading' | 'ready' | 'empty' | 'offline' | 'error'

const FAMILY_PATH = 'family.json'
const TEMPLATE_RE = /^templates\/([^/]+)\.json$/
const TRIP_RE = /^trips\/([^/]+)\.json$/
const PACKING_RE = /^trips\/([^/]+)\/packing\/([^/]+)\.json$/

export const templatePath = (id: string) => `templates/${id}.json`
export const tripPath = (id: string) => `trips/${id}.json`
export const packingPath = (tripId: string, personId: string) => `trips/${tripId}/packing/${personId}.json`
export const attachmentPath = (tripId: string, attId: string, name: string) => `trips/${tripId}/files/${attId}-${slugify(name.replace(/\.[^.]+$/, '')) || 'file'}${extOf(name)}`

function extOf(name: string): string {
  const m = name.match(/\.[a-z0-9]{1,6}$/i)
  return m ? m[0].toLowerCase() : ''
}

function isInterestingPath(p: string): boolean {
  return p === FAMILY_PATH || TEMPLATE_RE.test(p) || TRIP_RE.test(p) || PACKING_RE.test(p)
}

export const useRepoStore = defineStore('repo', () => {
  const cfgStore = useConfigStore()
  const ui = useUiStore()

  const status = ref<RepoStatus>('unconfigured')
  const errorMessage = ref<string | null>(null)
  const lastSync = ref<Date | null>(null)
  const refreshing = ref(false)
  /** Reactive view of each document's data, keyed by path. */
  const data = shallowReactive<Record<string, unknown>>({})
  const saveStates = shallowReactive<Record<string, SaveState>>({})
  /** Non-reactive Doc instances. */
  const docs = new Map<string, Doc<unknown>>()

  const cfg = (): RepoConfig => cfgStore.repoConfig
  const author = (): string => {
    const me = family.value?.people.find((p) => p.id === cfgStore.config.meId)
    return me?.name ?? 'Someone'
  }

  const canEdit = computed(() => status.value === 'ready' && ui.online)
  const saving = computed(() => Object.values(saveStates).some((s) => s === 'saving'))

  // ── derived documents ──────────────────────────────────────────────────────

  const family = computed(() => (data[FAMILY_PATH] as Family | undefined) ?? null)
  const templates = computed(() =>
    Object.keys(data)
      .filter((p) => TEMPLATE_RE.test(p))
      .map((p) => data[p] as TripTemplate)
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  const trips = computed(() =>
    Object.keys(data)
      .filter((p) => TRIP_RE.test(p))
      .map((p) => data[p] as Trip),
  )
  function trip(id: string): Trip | null {
    return (data[tripPath(id)] as Trip | undefined) ?? null
  }
  function template(id: string): TripTemplate | null {
    return (data[templatePath(id)] as TripTemplate | undefined) ?? null
  }
  function packing(tripId: string, personId: string): PackingList | null {
    return (data[packingPath(tripId, personId)] as PackingList | undefined) ?? null
  }
  function packingLists(tripId: string): PackingList[] {
    return Object.keys(data)
      .filter((p) => {
        const m = p.match(PACKING_RE)
        return m && m[1] === tripId
      })
      .map((p) => data[p] as PackingList)
  }
  function me() {
    return family.value?.people.find((p) => p.id === cfgStore.config.meId) ?? null
  }

  // ── doc plumbing ───────────────────────────────────────────────────────────

  function attach<T>(path: string, d: T, sha: string | null): Doc<T> {
    const doc = markRaw(
      new Doc<T>(path, d, sha, cfg, author, {
        onState: (p, s, msg) => {
          saveStates[p] = s
          if (s === 'error') ui.toast(`Save failed: ${msg ?? 'unknown error'}`, 'error', 6000)
          if (s === 'conflict') ui.toast(msg ?? 'Conflict: reloaded the latest version', 'error', 6000)
        },
      }),
    )
    doc.onChange = (nd) => {
      data[path] = nd
    }
    docs.set(path, doc as Doc<unknown>)
    data[path] = d
    saveStates[path] = 'idle'
    return doc
  }

  function detach(path: string): void {
    docs.delete(path)
    delete data[path]
    delete saveStates[path]
  }

  function commit<T>(path: string, op: Op<T>): void {
    if (!canEdit.value) {
      ui.toast(ui.online ? 'Not ready to save yet' : 'You are offline; changes are disabled', 'error')
      return
    }
    const doc = docs.get(path) as Doc<T> | undefined
    if (!doc) {
      ui.toast('That item no longer exists', 'error')
      return
    }
    doc.commit(op)
  }

  const commitTrip = (tripId: string, op: Op<Trip>) => commit(tripPath(tripId), op)
  const commitPacking = (tripId: string, personId: string, op: Op<PackingList>) => commit(packingPath(tripId, personId), op)
  const commitFamily = (op: Op<Family>) => commit(FAMILY_PATH, op)
  const commitTemplate = (id: string, op: Op<TripTemplate>) => commit(templatePath(id), op)

  // ── loading ────────────────────────────────────────────────────────────────

  async function hydrateFromCache(): Promise<void> {
    const keys = await cacheKeys()
    for (const k of keys) {
      if (!isInterestingPath(k)) continue
      if (docs.has(k)) continue
      const c = await cacheGet(k)
      if (c) attach(k, c.data, c.sha)
    }
  }

  async function init(): Promise<void> {
    if (!cfgStore.hasRepo) {
      status.value = 'unconfigured'
      return
    }
    status.value = 'loading'
    await hydrateFromCache()
    if (docs.size && data[FAMILY_PATH]) {
      // Show cached state immediately; refresh will reconcile.
      status.value = ui.online ? 'loading' : 'offline'
    }
    await refresh()
  }

  async function refresh(): Promise<void> {
    if (!cfgStore.hasRepo || refreshing.value) return
    refreshing.value = true
    try {
      const tree = await getTree(cfg())
      const remote = new Map<string, string>()
      if (tree) for (const e of tree) if (e.type === 'blob' && isInterestingPath(e.path)) remote.set(e.path, e.sha)

      // Remove docs that vanished remotely (unless they have unsaved edits).
      for (const [path, doc] of [...docs]) {
        if (!remote.has(path) && !doc.hasPending) {
          detach(path)
          await cacheDel(path)
        }
      }
      // Fetch changed/new files.
      const changed = [...remote].filter(([path, sha]) => docs.get(path)?.sha !== sha)
      await Promise.all(
        changed.map(async ([path, sha]) => {
          const existing = docs.get(path)
          if (existing?.hasPending) return // our save will reconcile
          const f = await getTextFile(cfg(), path)
          if (!f) return
          let parsed: unknown
          try {
            parsed = JSON.parse(f.content)
          } catch {
            return
          }
          if (existing) existing.acceptRemote(parsed, f.sha)
          else attach(path, parsed, f.sha)
          await cacheSet(path, sha, parsed)
        }),
      )
      lastSync.value = new Date()
      errorMessage.value = null
      status.value = data[FAMILY_PATH] ? 'ready' : 'empty'
    } catch (e) {
      if (e instanceof OfflineError) {
        status.value = docs.size ? 'offline' : 'offline'
        errorMessage.value = null
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        errorMessage.value = e instanceof GitHubError && e.isAuth ? `GitHub refused the token (${msg})` : msg
        status.value = 'error'
      }
    } finally {
      refreshing.value = false
    }
  }

  function startAutoRefresh(): () => void {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && ui.online) void refresh()
    }, 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }

  async function reset(): Promise<void> {
    for (const path of [...docs.keys()]) detach(path)
    await cacheClearAll()
    status.value = 'unconfigured'
  }

  // ── creating / deleting whole files ────────────────────────────────────────

  async function createFile<T>(path: string, d: T, message: string): Promise<void> {
    const sha = await putFile(cfg(), path, JSON.stringify(d, null, 2) + '\n', { message: `${author()}: ${message}` })
    attach(path, d, sha)
    await cacheSet(path, sha, d)
  }

  async function removeFile(path: string, message: string): Promise<void> {
    const doc = docs.get(path)
    if (!doc?.sha) {
      detach(path)
      return
    }
    await deleteFile(cfg(), path, doc.sha, `${author()}: ${message}`)
    detach(path)
    await cacheDel(path)
  }

  /** First run: write family.json and the starter templates. */
  async function scaffold(fam: Family): Promise<void> {
    status.value = 'loading'
    try {
      await createFile(FAMILY_PATH, fam, 'set up family')
      for (const tpl of STARTER_TEMPLATES) {
        if (!docs.has(templatePath(tpl.id))) await createFile(templatePath(tpl.id), tpl, `add starter template ${tpl.name}`)
      }
      status.value = 'ready'
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  async function createTrip(t: Trip, lists: PackingList[]): Promise<void> {
    await createFile(tripPath(t.id), t, `create trip ${t.name}`)
    for (const l of lists) await createFile(packingPath(t.id, l.personId), l, `packing list for ${l.personId}`)
  }

  async function deleteTrip(id: string): Promise<void> {
    const t = trip(id)
    for (const l of packingLists(id)) await removeFile(packingPath(id, l.personId), `delete packing list`)
    if (t) {
      for (const a of t.attachments) {
        try {
          await deleteAttachmentFile(a)
        } catch {
          /* ignore */
        }
      }
    }
    await removeFile(tripPath(id), `delete trip ${t?.name ?? id}`)
    if (cfgStore.config.currentTripId === id) cfgStore.setCurrentTrip(null)
  }

  async function createPackingList(tripId: string, list: PackingList): Promise<void> {
    await createFile(packingPath(tripId, list.personId), list, `packing list for ${list.personId}`)
  }

  async function createTemplate(tpl: TripTemplate): Promise<void> {
    await createFile(templatePath(tpl.id), tpl, `create template ${tpl.name}`)
  }

  async function deleteTemplate(id: string): Promise<void> {
    await removeFile(templatePath(id), `delete template ${id}`)
  }

  // ── attachments ────────────────────────────────────────────────────────────

  async function uploadAttachment(
    tripId: string,
    file: { name: string; mime: string; bytes: Uint8Array },
    target: { taskId?: string; legId?: string; bookingId?: string },
    keepOffline = false,
  ): Promise<Attachment> {
    const id = uid()
    const path = attachmentPath(tripId, id, file.name)
    await putFile(cfg(), path, file.bytes, { message: `${author()}: attach ${file.name}` })
    const att: Attachment = {
      id,
      name: file.name,
      path,
      mime: file.mime,
      sizeBytes: file.bytes.byteLength,
      keepOffline,
      addedBy: cfgStore.config.meId ?? '',
      addedAt: nowIso(),
    }
    if (keepOffline) await fileCachePut(path, file.bytes, file.mime)
    commitTrip(tripId, tripOps.addAttachment(att, target))
    return att
  }

  async function attachmentBlob(att: Attachment): Promise<Blob> {
    const cached = await fileCacheGet(att.path)
    if (cached) return cached
    const bytes = await getRawFile(cfg(), att.path)
    if (!bytes) throw new Error('File not found in the data repo')
    if (att.keepOffline) await fileCachePut(att.path, bytes, att.mime)
    return new Blob([bytes as BufferSource], { type: att.mime })
  }

  async function setKeepOffline(tripId: string, att: Attachment, keep: boolean): Promise<void> {
    if (keep) {
      const bytes = await getRawFile(cfg(), att.path)
      if (bytes) await fileCachePut(att.path, bytes, att.mime)
    } else {
      await fileCacheDelete(att.path)
    }
    commitTrip(tripId, tripOps.updateAttachment(att.id, { keepOffline: keep }))
  }

  async function deleteAttachmentFile(att: Attachment): Promise<void> {
    const sha = await getFileSha(cfg(), att.path)
    if (sha) await deleteFile(cfg(), att.path, sha, `${author()}: remove ${att.name}`)
    await fileCacheDelete(att.path)
  }

  async function deleteAttachment(tripId: string, att: Attachment): Promise<void> {
    await deleteAttachmentFile(att)
    commitTrip(tripId, tripOps.removeAttachment(att.id))
  }

  /** Make sure every keepOffline attachment of a trip is in the file cache. */
  async function ensureOfflineFiles(tripId: string): Promise<void> {
    const t = trip(tripId)
    if (!t || !ui.online) return
    for (const a of t.attachments) {
      if (!a.keepOffline) continue
      if (await fileCacheHas(a.path)) continue
      try {
        const bytes = await getRawFile(cfg(), a.path)
        if (bytes) await fileCachePut(a.path, bytes, a.mime)
      } catch {
        /* try again next time */
      }
    }
  }

  return {
    status,
    errorMessage,
    lastSync,
    refreshing,
    saving,
    canEdit,
    saveStates,
    family,
    templates,
    trips,
    trip,
    template,
    packing,
    packingLists,
    me,
    init,
    refresh,
    startAutoRefresh,
    reset,
    scaffold,
    commitTrip,
    commitPacking,
    commitFamily,
    commitTemplate,
    createTrip,
    deleteTrip,
    createPackingList,
    createTemplate,
    deleteTemplate,
    uploadAttachment,
    attachmentBlob,
    setKeepOffline,
    deleteAttachment,
    ensureOfflineFiles,
  }
})
