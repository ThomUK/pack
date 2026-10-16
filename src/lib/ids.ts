export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Trip id: `<start-date>-<slug>`; the date is the first leg's local date. */
export function tripId(startDate: string, name: string, existing: string[] = []): string {
  const base = `${startDate}-${slugify(name) || 'trip'}`
  let id = base
  let n = 2
  while (existing.includes(id)) id = `${base}-${n++}`
  return id
}

export function personId(name: string, existing: string[] = []): string {
  const base = slugify(name) || 'person'
  let id = base
  let n = 2
  while (existing.includes(id)) id = `${base}-${n++}`
  return id
}

export function nowIso(): string {
  return new Date().toISOString()
}
