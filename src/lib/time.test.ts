import { describe, it, expect } from 'vitest'
import { localTimeToDate, dateToLocalTime, dualTime, tripState, returnLeg, dueDate, countdown, tzOffsetMinutes, departureDate, departureIsEstimate, tripStartDate, sortedLegs, endDate } from './time'
import type { Trip, Leg } from './models'

function leg(id: string, kind: Leg['kind'], dep: string, arr: string, tz = 'Europe/London'): Leg {
  return { id, kind, title: id, from: '', to: '', departAt: { local: dep, tz }, arriveAt: { local: arr, tz }, details: {}, attachmentIds: [] }
}

function trip(legs: Leg[], returnStartsAtLegId: string | null = null): Trip {
  return {
    version: 1,
    id: 't',
    name: 'T',
    startDate: '2027-02-14',
    typeIds: [],
    travellers: [],
    notes: '',
    legs,
    returnStartsAtLegId,
    bookings: [],
    bags: [],
    tasks: [],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  }
}

describe('time zones', () => {
  it('converts London winter time to UTC', () => {
    expect(localTimeToDate({ local: '2027-02-14T06:30', tz: 'Europe/London' }).toISOString()).toBe('2027-02-14T06:30:00.000Z')
  })
  it('converts London summer time to UTC', () => {
    expect(localTimeToDate({ local: '2027-07-14T06:30', tz: 'Europe/London' }).toISOString()).toBe('2027-07-14T05:30:00.000Z')
  })
  it('converts Geneva to UTC', () => {
    expect(localTimeToDate({ local: '2027-02-21T10:00', tz: 'Europe/Zurich' }).toISOString()).toBe('2027-02-21T09:00:00.000Z')
  })
  it('round-trips through dateToLocalTime', () => {
    const lt = { local: '2027-02-21T10:00', tz: 'Europe/Zurich' }
    expect(dateToLocalTime(localTimeToDate(lt), 'Europe/Zurich')).toEqual(lt)
  })
  it('offset for New York in summer is -240', () => {
    expect(tzOffsetMinutes(new Date('2027-07-01T12:00:00Z'), 'America/New_York')).toBe(-240)
  })
  it('shows home time when abroad', () => {
    const d = dualTime({ local: '2027-02-21T10:00', tz: 'Europe/Zurich' }, 'Europe/London')
    expect(d.local).toMatch(/^10:00/)
    expect(d.home).toMatch(/^09:00/)
  })
  it('omits home time at home', () => {
    const d = dualTime({ local: '2027-02-21T10:00', tz: 'Europe/London' }, 'Europe/London')
    expect(d.home).toBeNull()
  })
})

describe('trip timing', () => {
  const t = trip([
    leg('drive', 'drive', '2027-02-14T04:00', '2027-02-14T06:00'),
    leg('fly', 'flight', '2027-02-14T08:00', '2027-02-14T11:00'),
    leg('stay', 'stay', '2027-02-14T16:00', '2027-02-21T10:00', 'Europe/Zurich'),
    leg('fly-home', 'flight', '2027-02-21T14:00', '2027-02-21T15:00', 'Europe/Zurich'),
    leg('drive-home', 'drive', '2027-02-21T15:30', '2027-02-21T18:00'),
  ])

  it('return leg defaults to the first leg after the last stay', () => {
    expect(returnLeg(t)?.id).toBe('fly-home')
  })
  it('return leg honours an explicit override', () => {
    expect(returnLeg({ ...t, returnStartsAtLegId: 'drive-home' })?.id).toBe('drive-home')
  })
  it('state is upcoming, current, archived a day after the end', () => {
    expect(tripState(t, new Date('2027-02-01T00:00:00Z'))).toBe('upcoming')
    expect(tripState(t, new Date('2027-02-17T00:00:00Z'))).toBe('current')
    expect(tripState(t, new Date('2027-02-22T12:00:00Z'))).toBe('current')
    expect(tripState(t, new Date('2027-02-22T18:01:00Z'))).toBe('archived')
  })
  it('relative due dates resolve against departure, return and legs', () => {
    expect(dueDate(t, { kind: 'relative', anchor: 'departure', offsetHours: -48 })?.toISOString()).toBe('2027-02-12T04:00:00.000Z')
    expect(dueDate(t, { kind: 'relative', anchor: 'return', offsetHours: -24 })?.toISOString()).toBe('2027-02-20T13:00:00.000Z')
    expect(dueDate(t, { kind: 'relative', anchor: { legId: 'fly' }, offsetHours: -24 })?.toISOString()).toBe('2027-02-13T08:00:00.000Z')
    expect(dueDate(t, { kind: 'none' })).toBeNull()
  })
  it('falls back to the start date when there are no timed legs', () => {
    const bare = trip([])
    expect(departureDate(bare)?.getFullYear()).toBe(2027)
    expect(departureIsEstimate(bare)).toBe(true)
    expect(tripState(bare, new Date('2027-01-01T00:00:00'))).toBe('upcoming')
    expect(tripState(bare, new Date('2027-02-14T12:00:00'))).toBe('current')
    expect(tripState(bare, new Date('2027-02-16T12:00:00'))).toBe('archived')
    expect(tripStartDate({ ...bare, startDate: '' as string, id: '2026-05-01-old' })).toBe('2026-05-01')
  })
  it('keeps undated legs at the end and ignores them for timing', () => {
    const t2 = trip([leg('b', 'flight', '2027-02-14T08:00', '2027-02-14T11:00'), { ...leg('x', 'stay', '', ''), departAt: { local: '', tz: 'Europe/London' }, arriveAt: { local: '', tz: 'Europe/London' } }])
    expect(sortedLegs(t2).map((l) => l.id)).toEqual(['b', 'x'])
    expect(departureIsEstimate(t2)).toBe(false)
    expect(endDate(t2)?.toISOString()).toBe('2027-02-14T11:00:00.000Z')
  })
  it('countdown splits into days/hours/minutes', () => {
    const c = countdown(new Date('2027-02-14T04:00:00Z'), new Date('2027-02-12T01:30:00Z'))
    expect(c).toMatchObject({ days: 2, hours: 2, minutes: 30, past: false })
  })
})
