import { describe, it, expect } from 'vitest'
import { createTripFromTemplates, mergeTemplateTasks, packingItemsFor, parsePackingText, cloneTrip, shiftLocal, daysBetween } from './trip-factory'
import { STARTER_TEMPLATES } from './starter-templates'
import type { Family, TripTemplate } from './models'

const family: Family = {
  version: 1,
  name: 'Smiths',
  homeTimezone: 'Europe/London',
  people: [
    { id: 'tom', name: 'Tom', role: 'adult', managedBy: 'self' },
    { id: 'jane', name: 'Jane', role: 'adult', managedBy: 'self' },
    { id: 'kid1', name: 'Kid One', role: 'child', managedBy: 'parent' },
    { id: 'kid2', name: 'Kid Two', role: 'child', managedBy: 'parent' },
  ],
}

const ski = STARTER_TEMPLATES.find((t) => t.id === 'ski')!
const hotel = STARTER_TEMPLATES.find((t) => t.id === 'hotel')!

describe('template merging', () => {
  it('collapses duplicate task titles across templates', () => {
    const merged = mergeTemplateTasks([ski, hotel])
    const titles = merged.map((t) => t.title.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
    expect(merged.filter((t) => t.title === 'Book airport parking')).toHaveLength(1)
  })
  it('uses personal adult list when present, else default; children get child list', () => {
    const tpl: TripTemplate = {
      ...ski,
      packing: { ...ski.packing, byPerson: { jane: [{ name: 'Makeup bag' }] } },
    }
    expect(packingItemsFor([tpl], family.people[1]!).map((i) => i.name)).toEqual(['Makeup bag'])
    expect(packingItemsFor([tpl], family.people[0]!).map((i) => i.name)).toContain('Ski jacket')
    expect(packingItemsFor([tpl], family.people[2]!).map((i) => i.name)).toContain('Favourite toy or comforter')
  })
})

describe('createTripFromTemplates', () => {
  const { trip, packing } = createTripFromTemplates(
    { name: 'Tignes ski', typeIds: ['ski'], travellers: ['tom', 'jane', 'kid1'], startDate: '2027-02-14' },
    [ski],
    family,
    [],
  )
  it('builds the id from date and name', () => {
    expect(trip.id).toBe('2027-02-14-tignes-ski')
  })
  it('expands per-traveller tasks to one per traveller', () => {
    const packTasks = trip.tasks.filter((t) => t.kind === 'pack')
    expect(packTasks).toHaveLength(3)
    expect(packTasks.map((t) => t.assigneeId).sort()).toEqual(['jane', 'kid1', 'tom'])
    expect((packTasks[0]!.fields as { personId: string }).personId).toBe(packTasks[0]!.assigneeId)
  })
  it('creates one packing list per traveller', () => {
    expect(packing.map((p) => p.personId).sort()).toEqual(['jane', 'kid1', 'tom'])
    expect(packing.find((p) => p.personId === 'kid1')!.items.some((i) => i.name === 'Ski jacket')).toBe(true)
  })
  it('pre-fills a document check per traveller for passports and GHIC/EHIC cards', () => {
    const docTasks = trip.tasks.filter((t) => t.kind === 'documents')
    expect(docTasks).toHaveLength(2)
    const byType = Object.fromEntries(docTasks.map((t) => [(t.fields as { documentType: string }).documentType, t]))
    expect(Object.keys(byType).sort()).toEqual(['ghic', 'passport'])
    for (const t of docTasks) expect((t.fields as { checks: unknown[] }).checks).toHaveLength(3)
    expect(byType['ghic']!.due).toEqual({ kind: 'relative', anchor: 'departure', offsetHours: -24 * 42 })
  })
  it('packs a GHIC/EHIC card next to the passport', () => {
    for (const p of packing) expect(p.items.map((i) => i.name)).toEqual(expect.arrayContaining(['Passport', 'GHIC / EHIC card']))
  })
  it('gives checkin tasks default opening rules', () => {
    const ci = trip.tasks.find((t) => t.kind === 'checkin')!
    expect(ci.fields).toMatchObject({ legId: null, opens: { kind: 'relative', hoursBefore: 24 }, boardingPasses: {} })
  })
})

describe('cloneTrip', () => {
  it('shifts legs to the new start date and resets progress', () => {
    const { trip, packing } = createTripFromTemplates(
      { name: 'Tignes ski', typeIds: ['ski'], travellers: ['tom', 'kid1'], startDate: '2027-02-14' },
      [ski],
      family,
      [],
    )
    trip.legs.push({
      id: 'l1',
      kind: 'flight',
      title: 'Fly out',
      from: 'MAN',
      to: 'GVA',
      departAt: { local: '2027-02-14T08:00', tz: 'Europe/London' },
      arriveAt: { local: '2027-02-14T11:00', tz: 'Europe/Zurich' },
      details: {},
      attachmentIds: [],
    })
    trip.tasks[0]!.status = 'done'
    packing[0]!.items[0]!.packed = true
    const c = cloneTrip(trip, packing, { name: 'Tignes again', startDate: '2028-02-12', travellers: ['tom', 'kid1'] }, family, [trip.id])
    expect(c.trip.id).toBe('2028-02-12-tignes-again')
    expect(c.trip.legs[0]!.departAt.local).toBe('2028-02-12T08:00')
    expect(c.trip.legs[0]!.arriveAt.tz).toBe('Europe/Zurich')
    expect(c.trip.tasks.every((t) => t.status === 'todo')).toBe(true)
    expect(c.packing[0]!.items.every((i) => !i.packed)).toBe(true)
    expect(c.packing[0]!.items.length).toBe(packing[0]!.items.length)
  })
  it('date helpers', () => {
    expect(daysBetween('2027-02-14', '2028-02-12')).toBe(363)
    expect(shiftLocal('2027-02-28T09:30', 2)).toBe('2027-03-02T09:30')
  })
})

describe('parsePackingText', () => {
  it('parses lines, bullets and quantities', () => {
    expect(parsePackingText('- Socks x4\n* 2x T-shirts\nHat\n\n[ ] Gloves (2)\n')).toEqual([
      { name: 'Socks', qty: 4 },
      { name: 'T-shirts', qty: 2 },
      { name: 'Hat' },
      { name: 'Gloves', qty: 2 },
    ])
  })
})
