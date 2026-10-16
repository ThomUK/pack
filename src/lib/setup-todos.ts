// The trip's own setup to-do list: computed from the data, never stored, so it
// is always accurate. Each item says what is missing and where to fix it.
import type { Trip, PackingList, Person, CheckinTaskFields, WeighBagTaskFields } from './models'
import { LEG_KIND_LABELS } from './models'
import { hasTime, returnLeg, sortedLegs } from './time'

export type SetupTarget =
  | { kind: 'legs' }
  | { kind: 'leg'; legId: string }
  | { kind: 'bags' }
  | { kind: 'travellers' }
  | { kind: 'task'; taskId: string }
  | { kind: 'packing'; personId: string }

export interface SetupTodo {
  id: string
  text: string
  target: SetupTarget
  /** 'blocking' items stop the countdown or tasks from working; 'nice' items are polish. */
  level: 'blocking' | 'nice'
}

export function hasFlight(trip: Trip): boolean {
  return trip.legs.some((l) => l.kind === 'flight')
}

export function setupTodos(trip: Trip, people: Person[], packing: PackingList[]): SetupTodo[] {
  const out: SetupTodo[] = []
  const legs = sortedLegs(trip)
  const legName = (l: (typeof legs)[number]) => l.title || LEG_KIND_LABELS[l.kind]

  if (!trip.travellers.length) out.push({ id: 'travellers', text: 'Add who is travelling', target: { kind: 'travellers' }, level: 'blocking' })

  if (!legs.length) {
    out.push({ id: 'legs', text: 'Add the itinerary legs (drive, flight, stay…) so the countdown uses real times', target: { kind: 'legs' }, level: 'blocking' })
  }

  for (const l of legs) {
    if (!hasTime(l.departAt)) {
      out.push({ id: `leg-dep-${l.id}`, text: `${legName(l)}: add the ${l.kind === 'stay' ? 'check-in' : 'departure'} date and time`, target: { kind: 'leg', legId: l.id }, level: 'blocking' })
    }
    if (!hasTime(l.arriveAt)) {
      out.push({ id: `leg-arr-${l.id}`, text: `${legName(l)}: add the ${l.kind === 'stay' ? 'check-out' : 'arrival'} date and time`, target: { kind: 'leg', legId: l.id }, level: 'blocking' })
    }
    if (l.kind === 'flight' && !l.details.flightNumber) {
      out.push({ id: `leg-fn-${l.id}`, text: `${legName(l)}: add the flight number`, target: { kind: 'leg', legId: l.id }, level: 'nice' })
    }
    if ((l.kind === 'flight' || l.kind === 'train' || l.kind === 'ferry') && !l.details.bookingRef) {
      out.push({ id: `leg-ref-${l.id}`, text: `${legName(l)}: add the booking reference`, target: { kind: 'leg', legId: l.id }, level: 'nice' })
    }
    if (l.kind === 'stay' && !l.details.address) {
      out.push({ id: `leg-addr-${l.id}`, text: `${legName(l)}: add the address`, target: { kind: 'leg', legId: l.id }, level: 'nice' })
    }
  }

  const flights = legs.filter((l) => l.kind === 'flight')
  if (flights.length && !trip.bags.length) {
    out.push({ id: 'bags', text: 'Add the bags and their weight allowances', target: { kind: 'bags' }, level: 'nice' })
  }
  if (flights.length > 1 && !returnLeg(trip)) {
    out.push({ id: 'return', text: 'Mark which leg starts the return journey (add a stay, or tick it on the leg)', target: { kind: 'legs' }, level: 'nice' })
  }

  for (const t of trip.tasks) {
    if (t.status === 'done') continue
    if (t.kind === 'checkin') {
      const f = t.fields as unknown as CheckinTaskFields
      if (!f.legId) {
        if (flights.length) out.push({ id: `task-leg-${t.id}`, text: `${t.title}: choose which flight it is for`, target: { kind: 'task', taskId: t.id }, level: 'nice' })
      } else if (!trip.legs.some((l) => l.id === f.legId)) {
        out.push({ id: `task-leg-${t.id}`, text: `${t.title}: its flight was deleted; choose another`, target: { kind: 'task', taskId: t.id }, level: 'blocking' })
      }
    }
    if (t.kind === 'weighBag') {
      const f = t.fields as unknown as WeighBagTaskFields
      if (f.bagId && !trip.bags.some((b) => b.id === f.bagId)) {
        out.push({ id: `task-bag-${t.id}`, text: `${t.title}: its bag was deleted; choose another`, target: { kind: 'task', taskId: t.id }, level: 'blocking' })
      }
    }
    const due = t.due
    const anchorLegId = due.kind === 'relative' && typeof due.anchor === 'object' ? due.anchor.legId : null
    if (anchorLegId && !trip.legs.some((l) => l.id === anchorLegId)) {
      out.push({ id: `task-due-${t.id}`, text: `${t.title}: its due date points at a deleted leg`, target: { kind: 'task', taskId: t.id }, level: 'blocking' })
    }
  }

  for (const id of trip.travellers) {
    if (!packing.some((p) => p.personId === id)) {
      const name = people.find((p) => p.id === id)?.name ?? id
      out.push({ id: `packing-${id}`, text: `${name} has no packing list yet`, target: { kind: 'packing', personId: id }, level: 'nice' })
    }
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'blocking' ? -1 : 1))
}
