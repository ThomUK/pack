import type { Leg, LocalTime, Trip, Due, DueAnchor, Task, CheckinOpens } from './models'

/** Common IANA zones offered in pickers; any valid zone string is accepted. */
export const COMMON_TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Vienna',
  'Europe/Athens',
  'Europe/Istanbul',
  'Atlantic/Canary',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Bangkok',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ── LocalTime <-> absolute time ──────────────────────────────────────────────

function partsInZone(date: Date, tz: string): Record<string, number> {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const p of f.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out
}

/** Offset of `tz` from UTC at `date`, in minutes. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = partsInZone(date, tz)
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** Convert a wall-clock time in `tz` into an absolute Date. */
export function localTimeToDate(lt: LocalTime): Date {
  const [datePart, timePart = '00:00'] = lt.local.split('T')
  const [y, m, d] = datePart!.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  // First guess: treat as UTC, then correct by the zone offset (iterate twice for DST edges).
  let guess = Date.UTC(y!, m! - 1, d!, hh!, mm!)
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(new Date(guess), lt.tz)
    guess = Date.UTC(y!, m! - 1, d!, hh!, mm!) - off * 60000
  }
  return new Date(guess)
}

/** Express an absolute Date as wall-clock time in `tz`. */
export function dateToLocalTime(date: Date, tz: string): LocalTime {
  const p = partsInZone(date, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    local: `${p.year}-${pad(p.month!)}-${pad(p.day!)}T${pad(p.hour!)}:${pad(p.minute!)}`,
    tz,
  }
}

export function localDate(lt: LocalTime): string {
  return lt.local.slice(0, 10)
}

export function hasTime(lt: LocalTime | null | undefined): lt is LocalTime {
  return !!lt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(lt.local)
}

/** Absolute time of a LocalTime, or null when it has not been entered yet. */
export function toDate(lt: LocalTime | null | undefined): Date | null {
  return hasTime(lt) ? localTimeToDate(lt) : null
}

// ── formatting ───────────────────────────────────────────────────────────────

export function fmtTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export function fmtDate(date: Date, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', ...opts }).format(date)
}

export function fmtDateTime(date: Date, tz: string): string {
  return `${fmtDate(date, tz)} ${fmtTime(date, tz)}`
}

export function tzShort(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
}

/**
 * Local time plus home time when they differ: "10:00 CET · 09:00 UK".
 * Returns { local, home } strings; `home` is null when zones give the same wall time.
 */
export function dualTime(lt: LocalTime, homeTz: string): { date: Date | null; local: string; home: string | null } {
  if (!hasTime(lt)) return { date: null, local: 'time TBC', home: null }
  const date = localTimeToDate(lt)
  const local = `${fmtTime(date, lt.tz)} ${tzShort(date, lt.tz)}`
  if (lt.tz === homeTz) return { date, local, home: null }
  const homeLt = dateToLocalTime(date, homeTz)
  if (homeLt.local === lt.local) return { date, local, home: null }
  const sameDay = homeLt.local.slice(0, 10) === lt.local.slice(0, 10)
  const home = `${sameDay ? '' : fmtDate(date, homeTz, { weekday: undefined }) + ' '}${fmtTime(date, homeTz)} ${tzShort(date, homeTz)}`
  return { date, local, home }
}

// ── trip timing ──────────────────────────────────────────────────────────────

/** Legs in time order; legs without a departure time keep their entry order at the end. */
export function sortedLegs(trip: Trip): Leg[] {
  const dated = trip.legs.filter((l) => hasTime(l.departAt)).sort((a, b) => localTimeToDate(a.departAt).getTime() - localTimeToDate(b.departAt).getTime())
  const undated = trip.legs.filter((l) => !hasTime(l.departAt))
  return [...dated, ...undated]
}

export function datedLegs(trip: Trip): Leg[] {
  return sortedLegs(trip).filter((l) => hasTime(l.departAt))
}

/** The trip's start date (YYYY-MM-DD); older trips without the field derive it from the id. */
export function tripStartDate(trip: Trip): string | null {
  if (trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) return trip.startDate
  const m = trip.id.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : null
}

function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00`)
}
function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59`)
}

/** Departure: the first timed leg, else midnight at the start of the start date. */
export function departureDate(trip: Trip): Date | null {
  const legs = datedLegs(trip)
  if (legs.length) return localTimeToDate(legs[0]!.departAt)
  const sd = tripStartDate(trip)
  return sd ? startOfDay(sd) : null
}

/** True when the countdown is only based on the start date, not an actual leg. */
export function departureIsEstimate(trip: Trip): boolean {
  return datedLegs(trip).length === 0
}

export function endDate(trip: Trip): Date | null {
  const arrivals = trip.legs.map((l) => toDate(l.arriveAt)).filter((d): d is Date => !!d)
  if (arrivals.length) return new Date(Math.max(...arrivals.map((d) => d.getTime())))
  const sd = tripStartDate(trip)
  return sd ? endOfDay(sd) : null
}

/** The leg where the return journey begins (explicit, else first leg after the last stay). */
export function returnLeg(trip: Trip): Leg | null {
  const legs = datedLegs(trip)
  if (!legs.length) return null
  if (trip.returnStartsAtLegId) {
    const l = legs.find((x) => x.id === trip.returnStartsAtLegId)
    if (l) return l
  }
  let lastStay = -1
  legs.forEach((l, i) => {
    if (l.kind === 'stay') lastStay = i
  })
  if (lastStay >= 0 && lastStay + 1 < legs.length) return legs[lastStay + 1]!
  return null
}

export function returnDate(trip: Trip): Date | null {
  const l = returnLeg(trip)
  return l ? toDate(l.departAt) : null
}

export type TripState = 'upcoming' | 'current' | 'archived' | 'unscheduled'

export function tripState(trip: Trip, now: Date = new Date()): TripState {
  const dep = departureDate(trip)
  const end = endDate(trip)
  if (!dep || !end) return 'unscheduled'
  if (now.getTime() < dep.getTime()) return 'upcoming'
  if (now.getTime() > end.getTime() + 24 * 3600 * 1000) return 'archived'
  return 'current'
}

// ── due dates ────────────────────────────────────────────────────────────────

export function anchorDate(trip: Trip, anchor: DueAnchor): Date | null {
  if (anchor === 'departure') return departureDate(trip)
  if (anchor === 'return') return returnDate(trip)
  const leg = trip.legs.find((l) => l.id === anchor.legId)
  return leg ? toDate(leg.departAt) : null
}

export function dueDate(trip: Trip, due: Due): Date | null {
  if (due.kind === 'none') return null
  if (due.kind === 'fixed') return new Date(due.at)
  const a = anchorDate(trip, due.anchor)
  return a ? new Date(a.getTime() + due.offsetHours * 3600 * 1000) : null
}

export function taskDueDate(trip: Trip, task: Task): Date | null {
  return dueDate(trip, task.due)
}

export function checkinOpensDate(trip: Trip, legId: string | null, opens: CheckinOpens): Date | null {
  if (opens.kind === 'fixed') return new Date(opens.at)
  const leg = legId ? trip.legs.find((l) => l.id === legId) : null
  const dep = leg ? toDate(leg.departAt) : null
  if (!dep) return null
  return new Date(dep.getTime() - opens.hoursBefore * 3600 * 1000)
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'later'

export function dueState(dueAt: Date | null, now: Date = new Date()): DueState {
  if (!dueAt) return 'none'
  const diff = dueAt.getTime() - now.getTime()
  if (diff < 0) return 'overdue'
  if (diff < 24 * 3600 * 1000) return 'today'
  if (diff < 3 * 24 * 3600 * 1000) return 'soon'
  return 'later'
}

export function describeDue(trip: Trip, due: Due, homeTz: string, now: Date = new Date()): string {
  const d = dueDate(trip, due)
  if (!d) return due.kind === 'none' ? '' : 'Due date needs a timed leg'
  const ms = d.getTime() - now.getTime()
  const days = Math.floor(ms / 86400000)
  if (ms < 0) {
    const ago = Math.ceil(-ms / 86400000)
    return ago <= 1 ? 'Overdue' : `Overdue by ${ago} days`
  }
  if (days === 0) return `Due today ${fmtTime(d, homeTz)}`
  if (days === 1) return 'Due tomorrow'
  if (days < 7) return `Due in ${days} days`
  return `Due ${fmtDate(d, homeTz)}`
}

// ── countdown ────────────────────────────────────────────────────────────────

export interface Countdown {
  totalMs: number
  days: number
  hours: number
  minutes: number
  past: boolean
}

export function countdown(target: Date, now: Date = new Date()): Countdown {
  let ms = target.getTime() - now.getTime()
  const past = ms < 0
  ms = Math.abs(ms)
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return { totalMs: target.getTime() - now.getTime(), days, hours, minutes, past }
}

export function hoursToOffsetLabel(hours: number): string {
  const abs = Math.abs(hours)
  const unit = abs % 24 === 0 && abs >= 24 ? `${abs / 24} day${abs / 24 === 1 ? '' : 's'}` : `${abs} hour${abs === 1 ? '' : 's'}`
  if (hours === 0) return 'at the time'
  return hours < 0 ? `${unit} before` : `${unit} after`
}
