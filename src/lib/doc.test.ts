import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./cache', () => ({ cacheSet: vi.fn(async () => {}) }))

const remote = { content: '', sha: 'sha0' }
const putFile = vi.fn()
const getTextFile = vi.fn()
vi.mock('./github', async () => {
  const actual = await vi.importActual<typeof import('./github')>('./github')
  return { ...actual, putFile: (...a: unknown[]) => putFile(...a), getTextFile: (...a: unknown[]) => getTextFile(...a) }
})

import { Doc } from './doc'
import { GitHubError } from './github'

interface Board {
  items: Record<string, boolean>
}

const cfg = { token: 't', owner: 'o', repo: 'r', branch: 'main' }

function tick(id: string) {
  return { apply: (d: Board) => ({ items: { ...d.items, [id]: true } }), describe: `tick ${id}` }
}

describe('Doc conflict replay', () => {
  beforeEach(() => {
    putFile.mockReset()
    getTextFile.mockReset()
    remote.content = JSON.stringify({ items: {} })
    remote.sha = 'sha0'
  })

  it('saves pending ops and updates sha', async () => {
    putFile.mockResolvedValueOnce('sha1')
    const doc = new Doc<Board>('x.json', { items: {} }, 'sha0', () => cfg, () => 'Tom')
    doc.commit(tick('a'))
    await doc.flush()
    expect(doc.sha).toBe('sha1')
    expect(doc.data.items).toEqual({ a: true })
    expect(putFile.mock.calls[0][3].message).toBe('Tom: tick a')
  })

  it('replays local ops on top of a concurrent remote change', async () => {
    // First put conflicts; remote has 'b' ticked by someone else.
    putFile.mockRejectedValueOnce(new GitHubError(409, 'x.json does not match'))
    getTextFile.mockResolvedValueOnce({ content: JSON.stringify({ items: { b: true } }), sha: 'sha1' })
    putFile.mockResolvedValueOnce('sha2')

    const doc = new Doc<Board>('x.json', { items: {} }, 'sha0', () => cfg, () => 'Tom')
    doc.commit(tick('a'))
    await doc.flush()

    expect(doc.sha).toBe('sha2')
    expect(doc.data.items).toEqual({ a: true, b: true })
    const saved = JSON.parse(putFile.mock.calls[1][2])
    expect(saved.items).toEqual({ a: true, b: true })
    expect(putFile.mock.calls[1][3].sha).toBe('sha1')
  })

  it('gives up after repeated conflicts and reloads remote', async () => {
    putFile.mockRejectedValue(new GitHubError(409, 'does not match'))
    getTextFile.mockResolvedValue({ content: JSON.stringify({ items: { z: true } }), sha: 'shaZ' })
    const states: string[] = []
    const doc = new Doc<Board>('x.json', { items: {} }, 'sha0', () => cfg, () => 'Tom', {
      onState: (_p, s) => states.push(s),
    })
    doc.commit(tick('a'))
    await doc.flush()
    expect(states.at(-1)).toBe('conflict')
    expect(doc.data.items).toEqual({ z: true })
    expect(doc.hasPending).toBe(false)
  })

  it('queues ops committed during a save and saves them afterwards', async () => {
    let resolveFirst: (v: string) => void = () => {}
    putFile.mockImplementationOnce(() => new Promise<string>((r) => (resolveFirst = r)))
    putFile.mockResolvedValueOnce('sha2')
    const doc = new Doc<Board>('x.json', { items: {} }, 'sha0', () => cfg, () => 'Tom')
    doc.commit(tick('a'))
    const p = doc.flush()
    doc.commit(tick('b'))
    resolveFirst('sha1')
    await p
    expect(putFile).toHaveBeenCalledTimes(2)
    expect(JSON.parse(putFile.mock.calls[1][2]).items).toEqual({ a: true, b: true })
    expect(doc.sha).toBe('sha2')
  })

  it('acceptRemote keeps unsaved local ops on top', () => {
    const doc = new Doc<Board>('x.json', { items: {} }, 'sha0', () => cfg, () => 'Tom')
    // Simulate a pending op without flushing (putFile never resolves)
    putFile.mockImplementation(() => new Promise(() => {}))
    doc.commit(tick('a'))
    doc.acceptRemote({ items: { b: true } }, 'sha9')
    expect(doc.data.items).toEqual({ a: true, b: true })
  })
})
