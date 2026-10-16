// Browser-side file preparation for attachments (SPEC §7).

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85
export const SOFT_LIMIT_BYTES = 5 * 1024 * 1024

export interface PreparedFile {
  name: string
  mime: string
  bytes: Uint8Array
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    try {
      return await downscaleImage(file)
    } catch {
      /* fall back to raw bytes */
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { name: file.name, mime: file.type || guessMime(file.name), bytes }
}

async function downscaleImage(file: File): Promise<PreparedFile> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const keepPng = file.type === 'image/png' && scale === 1 && file.size < 400 * 1024
  const mime = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, JPEG_QUALITY))
  if (!blob) throw new Error('encode failed')
  // Only use the re-encoded version if it is actually smaller.
  if (blob.size >= file.size) {
    return { name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
  }
  const name = mime === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name
  return { name, mime, bytes: new Uint8Array(await blob.arrayBuffer()) }
}

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
    eml: 'message/rfc822',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
