// A JSON document in the data repo with optimistic local edits and
// conflict-replay saving. See SPEC.md §4.
import { getTextFile, putFile, GitHubError, OfflineError, type RepoConfig } from './github'
import { cacheSet } from './cache'

export interface Op<T> {
  /** Pure function: returns the new document state. Must be safe to replay on fresh data. */
  apply: (data: T) => T
  /** Short description used in the commit message. */
  describe: string
}

export type SaveState = 'idle' | 'saving' | 'error' | 'conflict'

export interface DocListener {
  onState?: (path: string, state: SaveState, message?: string) => void
}

const MAX_ATTEMPTS = 3

export class Doc<T> {
  path: string
  data: T
  sha: string | null
  state: SaveState = 'idle'
  lastError: string | null = null
  private pending: Op<T>[] = []
  private inFlight: Op<T>[] = []
  private flushing: Promise<void> | null = null
  private cfgProvider: () => RepoConfig
  private authorProvider: () => string
  private listener: DocListener
  /** Called with the new data after any change (local or remote). */
  onChange: ((data: T) => void) | null = null

  constructor(
    path: string,
    data: T,
    sha: string | null,
    cfgProvider: () => RepoConfig,
    authorProvider: () => string,
    listener: DocListener = {},
  ) {
    this.path = path
    this.data = data
    this.sha = sha
    this.cfgProvider = cfgProvider
    this.authorProvider = authorProvider
    this.listener = listener
  }

  get hasPending(): boolean {
    return this.pending.length > 0 || this.inFlight.length > 0
  }

  /** Replace local state with a fresh remote copy, re-applying any unsaved ops on top. */
  acceptRemote(data: T, sha: string): void {
    let d = data
    for (const op of [...this.inFlight, ...this.pending]) d = op.apply(d)
    this.data = d
    this.sha = sha
    this.onChange?.(this.data)
  }

  /** Apply an operation locally and schedule a save. */
  commit(op: Op<T>): void {
    this.data = op.apply(this.data)
    this.pending.push(op)
    this.onChange?.(this.data)
    void this.flush()
  }

  private setState(state: SaveState, message?: string): void {
    this.state = state
    this.lastError = message ?? null
    this.listener.onState?.(this.path, state, message)
  }

  private serialize(data: T): string {
    return JSON.stringify(data, null, 2) + '\n'
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    if (!this.pending.length) return Promise.resolve()
    this.flushing = this.runFlush().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async runFlush(): Promise<void> {
    this.setState('saving')
    try {
      while (this.pending.length) {
        this.inFlight = this.pending
        this.pending = []
        await this.saveWithRetry()
        this.inFlight = []
      }
      this.setState('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Drop the unsaved ops; reload from remote so local state is truthful.
      this.inFlight = []
      this.pending = []
      this.setState(e instanceof GitHubError && e.isConflict ? 'conflict' : 'error', msg)
      try {
        await this.reload()
      } catch {
        /* keep whatever we have */
      }
    }
  }

  private async saveWithRetry(): Promise<void> {
    const cfg = this.cfgProvider()
    const author = this.authorProvider()
    const summary = this.inFlight.map((o) => o.describe).filter(Boolean)
    const message = `${author}: ${summary.slice(0, 3).join('; ')}${summary.length > 3 ? ` (+${summary.length - 3} more)` : ''}`
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const newSha = await putFile(cfg, this.path, this.serialize(this.data), { sha: this.sha, message })
        this.sha = newSha
        await cacheSet(this.path, newSha, this.data)
        return
      } catch (e) {
        if (e instanceof GitHubError && e.isConflict && attempt < MAX_ATTEMPTS) {
          // Someone else saved first: reload and replay our ops on top.
          const fresh = await getTextFile(cfg, this.path)
          const base = fresh ? (JSON.parse(fresh.content) as T) : this.data
          let d = base
          for (const op of [...this.inFlight, ...this.pending]) d = op.apply(d)
          this.data = d
          this.sha = fresh?.sha ?? null
          this.onChange?.(this.data)
          continue
        }
        if (e instanceof OfflineError) throw e
        throw e
      }
    }
    throw new GitHubError(409, 'Someone else changed this at the same time. Reloaded their version.')
  }

  async reload(): Promise<void> {
    const cfg = this.cfgProvider()
    const fresh = await getTextFile(cfg, this.path)
    if (fresh) {
      this.acceptRemote(JSON.parse(fresh.content) as T, fresh.sha)
      await cacheSet(this.path, fresh.sha, this.data)
    }
  }
}
