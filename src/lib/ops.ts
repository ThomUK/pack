// Operations: small, replayable, pure transforms on documents (SPEC §4).
import type { Op } from './doc'
import type {
  Trip,
  Task,
  Leg,
  Bag,
  Booking,
  Attachment,
  PackingList,
  PackingItem,
  Family,
  Person,
  TripTemplate,
  TemplateTask,
  PackingItemTemplate,
  ChecklistItem,
} from './models'
import { uid, nowIso } from './ids'

type Patch<T> = Partial<Omit<T, 'id'>>

function touch<T extends { updatedAt: string }>(d: T): T {
  return { ...d, updatedAt: nowIso() }
}

// ── trip ─────────────────────────────────────────────────────────────────────

export const tripOps = {
  patch(patch: Patch<Trip>): Op<Trip> {
    return { apply: (t) => touch({ ...t, ...patch }), describe: 'update trip' }
  },

  addLeg(leg: Leg): Op<Trip> {
    return { apply: (t) => touch({ ...t, legs: [...t.legs.filter((l) => l.id !== leg.id), leg] }), describe: `add leg ${leg.title}` }
  },
  updateLeg(id: string, patch: Patch<Leg>): Op<Trip> {
    return { apply: (t) => touch({ ...t, legs: t.legs.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), describe: 'update leg' }
  },
  removeLeg(id: string): Op<Trip> {
    return {
      apply: (t) =>
        touch({
          ...t,
          legs: t.legs.filter((l) => l.id !== id),
          returnStartsAtLegId: t.returnStartsAtLegId === id ? null : t.returnStartsAtLegId,
        }),
      describe: 'remove leg',
    }
  },

  addBag(bag: Bag): Op<Trip> {
    return { apply: (t) => touch({ ...t, bags: [...t.bags.filter((b) => b.id !== bag.id), bag] }), describe: `add bag ${bag.name}` }
  },
  updateBag(id: string, patch: Patch<Bag>): Op<Trip> {
    return { apply: (t) => touch({ ...t, bags: t.bags.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), describe: 'update bag' }
  },
  removeBag(id: string): Op<Trip> {
    return { apply: (t) => touch({ ...t, bags: t.bags.filter((b) => b.id !== id) }), describe: 'remove bag' }
  },

  upsertBooking(b: Booking): Op<Trip> {
    return {
      apply: (t) => touch({ ...t, bookings: t.bookings.some((x) => x.id === b.id) ? t.bookings.map((x) => (x.id === b.id ? b : x)) : [...t.bookings, b] }),
      describe: `booking ${b.provider}`,
    }
  },
  removeBooking(id: string): Op<Trip> {
    return { apply: (t) => touch({ ...t, bookings: t.bookings.filter((b) => b.id !== id) }), describe: 'remove booking' }
  },

  addTask(task: Task): Op<Trip> {
    return { apply: (t) => touch({ ...t, tasks: [...t.tasks.filter((x) => x.id !== task.id), task] }), describe: `add task ${task.title}` }
  },
  addTasks(tasks: Task[]): Op<Trip> {
    return {
      apply: (t) => {
        const ids = new Set(tasks.map((x) => x.id))
        return touch({ ...t, tasks: [...t.tasks.filter((x) => !ids.has(x.id)), ...tasks] })
      },
      describe: `add ${tasks.length} tasks`,
    }
  },
  updateTask(id: string, patch: Patch<Task>): Op<Trip> {
    return {
      apply: (t) => touch({ ...t, tasks: t.tasks.map((x) => (x.id === id ? touch({ ...x, ...patch }) : x)) }),
      describe: `update task`,
    }
  },
  setTaskStatus(id: string, done: boolean, by: string): Op<Trip> {
    return {
      apply: (t) =>
        touch({
          ...t,
          tasks: t.tasks.map((x) =>
            x.id === id
              ? touch({ ...x, status: done ? 'done' : 'todo', completedBy: done ? by : null, completedAt: done ? nowIso() : null })
              : x,
          ),
        }),
      describe: done ? 'done task' : 'reopen task',
    }
  },
  setTaskFields(id: string, fields: Record<string, unknown>): Op<Trip> {
    return {
      apply: (t) => touch({ ...t, tasks: t.tasks.map((x) => (x.id === id ? touch({ ...x, fields: { ...x.fields, ...fields } }) : x)) }),
      describe: 'update task details',
    }
  },
  setChecklistItem(taskId: string, itemId: string, done: boolean): Op<Trip> {
    return {
      apply: (t) =>
        touch({
          ...t,
          tasks: t.tasks.map((x) =>
            x.id === taskId ? touch({ ...x, checklist: x.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)) }) : x,
          ),
        }),
      describe: 'tick checklist',
    }
  },
  addChecklistItem(taskId: string, item: ChecklistItem): Op<Trip> {
    return {
      apply: (t) => touch({ ...t, tasks: t.tasks.map((x) => (x.id === taskId ? touch({ ...x, checklist: [...x.checklist, item] }) : x)) }),
      describe: 'add checklist item',
    }
  },
  removeChecklistItem(taskId: string, itemId: string): Op<Trip> {
    return {
      apply: (t) =>
        touch({ ...t, tasks: t.tasks.map((x) => (x.id === taskId ? touch({ ...x, checklist: x.checklist.filter((c) => c.id !== itemId) }) : x)) }),
      describe: 'remove checklist item',
    }
  },
  removeTask(id: string): Op<Trip> {
    return { apply: (t) => touch({ ...t, tasks: t.tasks.filter((x) => x.id !== id) }), describe: 'remove task' }
  },

  addAttachment(att: Attachment, target: { taskId?: string; legId?: string; bookingId?: string }): Op<Trip> {
    return {
      apply: (t) => {
        const next: Trip = { ...t, attachments: [...t.attachments.filter((a) => a.id !== att.id), att] }
        if (target.taskId) next.tasks = t.tasks.map((x) => (x.id === target.taskId ? touch({ ...x, attachmentIds: [...x.attachmentIds, att.id] }) : x))
        if (target.legId) next.legs = t.legs.map((l) => (l.id === target.legId ? { ...l, attachmentIds: [...l.attachmentIds, att.id] } : l))
        if (target.bookingId) next.bookings = t.bookings.map((b) => (b.id === target.bookingId ? { ...b, attachmentIds: [...b.attachmentIds, att.id] } : b))
        return touch(next)
      },
      describe: `attach ${att.name}`,
    }
  },
  updateAttachment(id: string, patch: Patch<Attachment>): Op<Trip> {
    return { apply: (t) => touch({ ...t, attachments: t.attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), describe: 'update attachment' }
  },
  removeAttachment(id: string): Op<Trip> {
    return {
      apply: (t) =>
        touch({
          ...t,
          attachments: t.attachments.filter((a) => a.id !== id),
          tasks: t.tasks.map((x) => ({ ...x, attachmentIds: x.attachmentIds.filter((a) => a !== id) })),
          legs: t.legs.map((l) => ({ ...l, attachmentIds: l.attachmentIds.filter((a) => a !== id) })),
          bookings: t.bookings.map((b) => ({ ...b, attachmentIds: b.attachmentIds.filter((a) => a !== id) })),
        }),
      describe: 'remove attachment',
    }
  },
}

// ── packing list ─────────────────────────────────────────────────────────────

export function newPackingItem(name: string, qty: number | null = null): PackingItem {
  return { id: uid(), name: name.trim(), qty, needToBuy: false, bought: false, packed: false, updatedAt: nowIso() }
}

export const packingOps = {
  add(items: PackingItem[]): Op<PackingList> {
    return { apply: (p) => touch({ ...p, items: [...p.items, ...items] }), describe: `add ${items.length} item${items.length === 1 ? '' : 's'}` }
  },
  update(id: string, patch: Patch<PackingItem>): Op<PackingList> {
    return {
      apply: (p) => touch({ ...p, items: p.items.map((i) => (i.id === id ? touch({ ...i, ...patch }) : i)) }),
      describe: patch.packed !== undefined ? (patch.packed ? 'packed item' : 'unpacked item') : 'update item',
    }
  },
  remove(id: string): Op<PackingList> {
    return { apply: (p) => touch({ ...p, items: p.items.filter((i) => i.id !== id) }), describe: 'remove item' }
  },
  resetPacked(): Op<PackingList> {
    return { apply: (p) => touch({ ...p, items: p.items.map((i) => touch({ ...i, packed: false })) }), describe: 'reset packing' }
  },
}

// ── family ───────────────────────────────────────────────────────────────────

export const familyOps = {
  patch(patch: Partial<Omit<Family, 'version' | 'people'>>): Op<Family> {
    return { apply: (f) => ({ ...f, ...patch }), describe: 'update family' }
  },
  upsertPerson(p: Person): Op<Family> {
    return {
      apply: (f) => ({ ...f, people: f.people.some((x) => x.id === p.id) ? f.people.map((x) => (x.id === p.id ? p : x)) : [...f.people, p] }),
      describe: `person ${p.name}`,
    }
  },
  removePerson(id: string): Op<Family> {
    return { apply: (f) => ({ ...f, people: f.people.filter((x) => x.id !== id) }), describe: 'remove person' }
  },
}

// ── template ─────────────────────────────────────────────────────────────────

export const templateOps = {
  patch(patch: Partial<Pick<TripTemplate, 'name'>>): Op<TripTemplate> {
    return { apply: (t) => ({ ...t, ...patch }), describe: 'update template' }
  },
  upsertTask(task: TemplateTask): Op<TripTemplate> {
    return {
      apply: (t) => ({ ...t, tasks: t.tasks.some((x) => x.id === task.id) ? t.tasks.map((x) => (x.id === task.id ? task : x)) : [...t.tasks, task] }),
      describe: `template task ${task.title}`,
    }
  },
  removeTask(id: string): Op<TripTemplate> {
    return { apply: (t) => ({ ...t, tasks: t.tasks.filter((x) => x.id !== id) }), describe: 'remove template task' }
  },
  /** Add packing items to one of the template lists, skipping names already present. */
  addPackingItems(list: 'child' | 'adultDefault' | { personId: string }, items: PackingItemTemplate[]): Op<TripTemplate> {
    return {
      apply: (t) => {
        const key = typeof list === 'string' ? list : list.personId
        const existing = typeof list === 'string' ? t.packing[list] : (t.packing.byPerson[key] ?? [])
        const names = new Set(existing.map((i) => i.name.toLowerCase()))
        const merged = [...existing, ...items.filter((i) => !names.has(i.name.toLowerCase()))]
        if (typeof list === 'string') return { ...t, packing: { ...t.packing, [list]: merged } }
        return { ...t, packing: { ...t.packing, byPerson: { ...t.packing.byPerson, [key]: merged } } }
      },
      describe: `template packing +${items.length}`,
    }
  },
  setPackingList(list: 'child' | 'adultDefault' | { personId: string }, items: PackingItemTemplate[]): Op<TripTemplate> {
    return {
      apply: (t) => {
        if (typeof list === 'string') return { ...t, packing: { ...t.packing, [list]: items } }
        return { ...t, packing: { ...t.packing, byPerson: { ...t.packing.byPerson, [list.personId]: items } } }
      },
      describe: 'set template packing',
    }
  },
}
