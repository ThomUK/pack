// Creating trips from templates, cloning, and per-traveller task expansion (SPEC §3.2, §5).
import type { Trip, TripTemplate, TemplateTask, Task, Person, PackingList, PackingItemTemplate, Family, Leg, Bag, CheckinTaskFields, DocumentsTaskFields, PackTaskFields, WeighBagTaskFields } from './models'
import { uid, nowIso, tripId } from './ids'
import { newPackingItem } from './ops'

export interface NewTripInput {
  name: string
  typeIds: string[]
  travellers: string[]
  notes?: string
  startDate: string // YYYY-MM-DD, used for the id when there are no legs yet
}

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase()
}

/** Merge task lists from several templates, collapsing duplicates by title. */
export function mergeTemplateTasks(templates: TripTemplate[]): Array<TemplateTask & { templateId: string }> {
  const out: Array<TemplateTask & { templateId: string }> = []
  const seen = new Set<string>()
  for (const tpl of templates) {
    for (const t of tpl.tasks) {
      const key = normalizeTitle(t.title)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...t, templateId: tpl.id })
    }
  }
  return out
}

/** Merge packing items from several templates for a given person. */
export function packingItemsFor(templates: TripTemplate[], person: Person): PackingItemTemplate[] {
  const out: PackingItemTemplate[] = []
  const seen = new Set<string>()
  for (const tpl of templates) {
    const list = person.role === 'child' ? tpl.packing.child : (tpl.packing.byPerson[person.id] ?? tpl.packing.adultDefault)
    for (const i of list) {
      const key = normalizeTitle(i.name)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...i })
    }
  }
  return out
}

function defaultFieldsFor(kind: Task['kind'], tplFields: Record<string, unknown>, personId: string | null): Record<string, unknown> {
  switch (kind) {
    case 'checkin': {
      const f: CheckinTaskFields = {
        legId: null,
        opens: (tplFields.opens as CheckinTaskFields['opens']) ?? { kind: 'relative', hoursBefore: 24 },
        passesInAirlineApp: false,
        boardingPasses: {},
      }
      return { ...tplFields, ...f }
    }
    case 'weighBag': {
      const f: WeighBagTaskFields = { bagId: null }
      return { ...tplFields, ...f }
    }
    case 'pack': {
      const f: PackTaskFields = { personId: personId ?? '' }
      return { ...tplFields, ...f }
    }
    case 'documents': {
      const f: DocumentsTaskFields = { documentType: (tplFields.documentType as DocumentsTaskFields['documentType']) ?? 'passport', checks: [] }
      return { ...tplFields, ...f }
    }
    case 'booking':
      return { bookingKind: 'other', ...tplFields }
    default:
      return { ...tplFields }
  }
}

/** Instantiate one template task into trip tasks (one per traveller when perTraveller). */
export function instantiateTask(
  tpl: TemplateTask & { templateId: string },
  travellers: Person[],
  adults: Person[],
): Task[] {
  const base = (assigneeId: string | null, personForFields: string | null, titleSuffix = ''): Task => ({
    id: uid(),
    kind: tpl.kind,
    title: tpl.title + titleSuffix,
    notes: tpl.notes,
    assigneeId,
    phase: tpl.phase,
    due: tpl.due,
    status: 'todo',
    completedBy: null,
    completedAt: null,
    checklist: tpl.checklist.map((name) => ({ id: uid(), name, done: false })),
    fields: defaultFieldsFor(tpl.kind, tpl.fields, personForFields),
    attachmentIds: [],
    templateId: tpl.templateId,
    updatedAt: nowIso(),
  })
  if (tpl.perTraveller) {
    return travellers.map((p) => base(p.id, p.id, ` — ${p.name}`))
  }
  // Non-per-traveller: adult-only tasks are unassigned but flagged for adults via assigneeRole;
  // we leave assigneeId null so any adult can pick it up. Documents tasks pre-fill a check per traveller.
  const t = base(null, null)
  if (tpl.kind === 'documents') {
    const f = t.fields as unknown as DocumentsTaskFields
    f.checks = travellers.map((p) => ({ personId: p.id, checked: false }))
  }
  if (tpl.assigneeRole === 'adult' && adults.length === 1) t.assigneeId = adults[0]!.id
  return [t]
}

export function createTripFromTemplates(input: NewTripInput, templates: TripTemplate[], family: Family, existingIds: string[]): { trip: Trip; packing: PackingList[] } {
  const travellers = family.people.filter((p) => input.travellers.includes(p.id))
  const adults = family.people.filter((p) => p.role === 'adult')
  const tasks = mergeTemplateTasks(templates).flatMap((t) => instantiateTask(t, travellers, adults))
  const now = nowIso()
  const trip: Trip = {
    version: 1,
    id: tripId(input.startDate, input.name, existingIds),
    name: input.name.trim(),
    startDate: input.startDate,
    typeIds: templates.map((t) => t.id),
    travellers: travellers.map((p) => p.id),
    notes: input.notes ?? '',
    legs: [],
    returnStartsAtLegId: null,
    bookings: [],
    bags: [],
    tasks,
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }
  const packing: PackingList[] = travellers.map((p) => ({
    version: 1,
    personId: p.id,
    items: packingItemsFor(templates, p).map((i) => newPackingItem(i.name, i.qty ?? null)),
    updatedAt: now,
  }))
  return { trip, packing }
}

/** Tasks to add when a traveller joins an existing trip: per-traveller template tasks for them. */
export function tasksForNewTraveller(trip: Trip, templates: TripTemplate[], person: Person): Task[] {
  const adults: Person[] = []
  return mergeTemplateTasks(templates.filter((t) => trip.typeIds.includes(t.id)))
    .filter((t) => t.perTraveller)
    .flatMap((t) => instantiateTask(t, [person], adults))
}

export function packingForNewTraveller(trip: Trip, templates: TripTemplate[], person: Person): PackingList {
  return {
    version: 1,
    personId: person.id,
    items: packingItemsFor(
      templates.filter((t) => trip.typeIds.includes(t.id)),
      person,
    ).map((i) => newPackingItem(i.name, i.qty ?? null)),
    updatedAt: nowIso(),
  }
}

/** Clone a trip as a fresh one: same legs (shifted to the new start), bags, tasks reset, packing reset. */
export function cloneTrip(
  source: Trip,
  sourcePacking: PackingList[],
  input: { name: string; startDate: string; travellers: string[] },
  family: Family,
  existingIds: string[],
): { trip: Trip; packing: PackingList[] } {
  const now = nowIso()
  const travellers = family.people.filter((p) => input.travellers.includes(p.id))
  const datedSource = source.legs.filter((l) => l.departAt.local)
  const shiftDays = daysBetween(datedSource.length ? earliestLocalDate(datedSource) : (source.startDate ?? input.startDate), input.startDate)
  const legs: Leg[] = source.legs.map((l) => ({
    ...l,
    id: uid(),
    departAt: { ...l.departAt, local: l.departAt.local ? shiftLocal(l.departAt.local, shiftDays) : '' },
    arriveAt: { ...l.arriveAt, local: l.arriveAt.local ? shiftLocal(l.arriveAt.local, shiftDays) : '' },
    attachmentIds: [],
  }))
  const bags: Bag[] = source.bags.map((b) => ({ ...b, id: uid(), measuredKg: null, measuredAt: null }))
  const travellerIds = new Set(travellers.map((p) => p.id))
  const tasks: Task[] = source.tasks
    .filter((t) => !t.assigneeId || travellerIds.has(t.assigneeId))
    .map((t) => ({
      ...t,
      id: uid(),
      status: 'todo',
      completedBy: null,
      completedAt: null,
      checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })),
      fields: resetFields(t),
      attachmentIds: [],
      updatedAt: now,
    }))
  const trip: Trip = {
    version: 1,
    id: tripId(input.startDate, input.name, existingIds),
    name: input.name.trim(),
    startDate: input.startDate,
    typeIds: [...source.typeIds],
    travellers: travellers.map((p) => p.id),
    notes: source.notes,
    legs,
    returnStartsAtLegId: null,
    bookings: [],
    bags,
    tasks,
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }
  const packing: PackingList[] = travellers.map((p) => {
    const src = sourcePacking.find((s) => s.personId === p.id)
    return {
      version: 1,
      personId: p.id,
      items: (src?.items ?? []).map((i) => newPackingItem(i.name, i.qty)),
      updatedAt: now,
    }
  })
  return { trip, packing }
}

function resetFields(t: Task): Record<string, unknown> {
  const f = { ...t.fields }
  if (t.kind === 'checkin') {
    f.boardingPasses = {}
    f.passesInAirlineApp = false
    f.legId = null
  }
  if (t.kind === 'weighBag') f.bagId = null
  if (t.kind === 'booking') {
    delete f.bookingId
    delete f.reference
  }
  if (t.kind === 'documents') {
    f.checks = ((f.checks as DocumentsTaskFields['checks']) ?? []).map((c) => ({ personId: c.personId, checked: false }))
  }
  return f
}

function earliestLocalDate(legs: Leg[]): string {
  return legs.map((l) => l.departAt.local.slice(0, 10)).sort()[0]!
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.UTC(+fromDate.slice(0, 4), +fromDate.slice(5, 7) - 1, +fromDate.slice(8, 10))
  const b = Date.UTC(+toDate.slice(0, 4), +toDate.slice(5, 7) - 1, +toDate.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

export function shiftLocal(local: string, days: number): string {
  if (!days) return local
  const [d, t = '00:00'] = local.split('T')
  const dt = new Date(Date.UTC(+d!.slice(0, 4), +d!.slice(5, 7) - 1, +d!.slice(8, 10) + days))
  return `${dt.toISOString().slice(0, 10)}T${t}`
}

/** Parse plain text, one item per line, into packing item templates. "2x socks" / "socks x2" set qty. */
export function parsePackingText(text: string): PackingItemTemplate[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-\*•·\[\]x✓☐☑]+/, '').trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      let m = l.match(/^(\d+)\s*[x×]\s+(.+)$/i)
      if (m) return { name: m[2]!.trim(), qty: +m[1]! }
      m = l.match(/^(.+?)\s*[x×]\s*(\d+)$/i)
      if (m) return { name: m[1]!.trim(), qty: +m[2]! }
      m = l.match(/^(.+?)\s*\((\d+)\)$/)
      if (m) return { name: m[1]!.trim(), qty: +m[2]! }
      return { name: l }
    })
}
