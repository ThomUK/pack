// Thin wrapper over the GitHub REST API for a single data repo.

export interface RepoConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
  get isConflict(): boolean {
    return this.status === 409 || (this.status === 422 && /does not match|sha/i.test(this.message))
  }
  get isNotFound(): boolean {
    return this.status === 404
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You appear to be offline')
  }
}

const API = 'https://api.github.com'

export function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return bytesToBase64(bytes)
}

export function b64decode(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64))
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
}

async function request(cfg: RepoConfig, method: string, url: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError()
  let res: Response
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new OfflineError()
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j && j.message) msg = j.message
    } catch {
      /* ignore */
    }
    throw new GitHubError(res.status, msg)
  }
  return res
}

export interface TreeEntry {
  path: string
  sha: string
  type: 'blob' | 'tree'
  size?: number
}

/** The full tree of the branch in one request. Returns null when the repo is empty. */
export async function getTree(cfg: RepoConfig): Promise<TreeEntry[] | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`
  try {
    const res = await request(cfg, 'GET', url)
    const j = await res.json()
    return (j.tree as TreeEntry[]).filter((e) => e.type === 'blob' || e.type === 'tree')
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return null // empty repo / no branch
    throw e
  }
}

export interface FileResult {
  content: string
  sha: string
}

export async function getTextFile(cfg: RepoConfig, path: string): Promise<FileResult | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
  try {
    const res = await request(cfg, 'GET', url)
    const j = await res.json()
    if (j.encoding === 'base64' && typeof j.content === 'string') {
      return { content: b64decode(j.content), sha: j.sha }
    }
    // Large files come back without content; fetch raw via blob.
    const blob = await getBlobBytes(cfg, j.sha)
    return { content: new TextDecoder().decode(blob), sha: j.sha }
  } catch (e) {
    if (e instanceof GitHubError && e.isNotFound) return null
    throw e
  }
}

export async function getBlobBytes(cfg: RepoConfig, sha: string): Promise<Uint8Array> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`
  const res = await request(cfg, 'GET', url, undefined, 'application/vnd.github.raw+json')
  return new Uint8Array(await res.arrayBuffer())
}

export interface PutOptions {
  sha?: string | null
  message: string
  author?: { name: string; email: string }
}

/** Create or update a file. `content` is a UTF-8 string or raw bytes. Returns the new blob sha. */
export async function putFile(cfg: RepoConfig, path: string, content: string | Uint8Array, opts: PutOptions): Promise<string> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}`
  const body: Record<string, unknown> = {
    message: opts.message,
    content: typeof content === 'string' ? b64encode(content) : bytesToBase64(content),
    branch: cfg.branch,
  }
  if (opts.sha) body.sha = opts.sha
  if (opts.author) body.committer = opts.author
  const res = await request(cfg, 'PUT', url, body)
  const j = await res.json()
  return j.content.sha as string
}

export async function deleteFile(cfg: RepoConfig, path: string, sha: string, message: string): Promise<void> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}`
  await request(cfg, 'DELETE', url, { message, sha, branch: cfg.branch })
}

export interface RepoInfo {
  fullName: string
  defaultBranch: string
  private: boolean
  permissions: { push: boolean; pull: boolean }
}

/** Verify the token can see the repo and whether it can write. */
export async function checkAccess(cfg: RepoConfig): Promise<RepoInfo> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}`
  const res = await request(cfg, 'GET', url)
  const j = await res.json()
  return {
    fullName: j.full_name,
    defaultBranch: j.default_branch,
    private: !!j.private,
    permissions: { push: !!j.permissions?.push, pull: !!j.permissions?.pull },
  }
}

/** Download a file's raw bytes by path (works for binary attachments up to 100 MB). */
export async function getRawFile(cfg: RepoConfig, path: string): Promise<Uint8Array | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
  try {
    const res = await request(cfg, 'GET', url, undefined, 'application/vnd.github.raw+json')
    return new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    if (e instanceof GitHubError && e.isNotFound) return null
    throw e
  }
}

/** Sha of a file at `path`, or null when missing. */
export async function getFileSha(cfg: RepoConfig, path: string): Promise<string | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
  try {
    const res = await request(cfg, 'GET', url)
    const j = await res.json()
    return j.sha as string
  } catch (e) {
    if (e instanceof GitHubError && e.isNotFound) return null
    throw e
  }
}
