import { describe, it, expect } from 'vitest'
import { setupTodos, hasFlight } from './setup-todos'
import { createTripFromTemplates } from './trip-factory'
import { STARTER_TEMPLATES } from './starter-templates'
import type { Family, Leg } from './models'

const family: Family = {
  version: 1,
  name: 'Smiths',
  homeTimezone: 'Europe/London',
  people: [
    { id: 'tom', name: 'Tom', role: 'adult', managedBy: 'self' },
    { id: 'kid', name: 'Kid', role: 'child', managedBy: 'parent' },
  ],
}
const ski = STARTER_TEMPLATES.find((t) => t.id === 'ski')!

function leg(id: string, kind: Leg['kind'], dep: string, arr: string, details: Leg['details'] = {}): Leg {
  return { id, kind, title: `${kind} ${id}`, from: 'A', to: 'B', departAt: { local: dep, tz: 'Europe/London' }, arriveAt: { local: arr, tz: 'Europe/London' }, details, attachmentIds: [] }
}

describe('setupTodos', () => {
  it('asks for legs on a brand new trip and for packing lists that are missing', () => {
    const { trip, packing } = createTripFromTemplates({ name: 'Ski', typeIds: ['ski'], travellers: ['tom', 'kid'], startDate: '2027-02-14' }, [ski], family, [])
    const todos = setupTodos(trip, family.people, packing)
    expect(todos.map((t) => t.id)).toContain('legs')
    expect(todos.some((t) => t.id.startsWith('packing-'))).toBe(false)
    expect(setupTodos(trip, family.people, []).map((t) => t.id)).toContain('packing-kid')
    expect(hasFlight(trip)).toBe(false)
  })

  it('flags undated legs, missing flight details, bags and check-in flights', () => {
    const { trip, packing } = createTripFromTemplates({ name: 'Ski', typeIds: ['ski'], travellers: ['tom'], startDate: '2027-02-14' }, [ski], family, [])
    trip.legs = [leg('out', 'flight', '2027-02-14T08:00', '2027-02-14T11:00'), leg('stay', 'stay', '', ''), leg('back', 'flight', '', '', { flightNumber: 'EZY1', bookingRef: 'ABC' })]
    const ids = setupTodos(trip, family.people, packing).map((t) => t.id)
    expect(ids).toContain('leg-fn-out')
    expect(ids).toContain('leg-ref-out')
    expect(ids).toContain('leg-dep-stay')
    expect(ids).toContain('leg-arr-stay')
    expect(ids).toContain('leg-addr-stay')
    expect(ids).toContain('leg-dep-back')
    expect(ids).not.toContain('leg-fn-back')
    expect(ids).toContain('bags')
    expect(ids.some((i) => i.startsWith('task-leg-'))).toBe(true)
    expect(hasFlight(trip)).toBe(true)
    // blocking items come first
    const todos = setupTodos(trip, family.people, packing)
    const firstNice = todos.findIndex((t) => t.level === 'nice')
    expect(todos.slice(firstNice).every((t) => t.level === 'nice')).toBe(true)
  })
})
