// Data model for the pack-data repo. Mirrors SPEC.md §3 and §5.

export type ISODateTime = string // "2027-02-14T06:30:00.000Z"

// ── family.json ──────────────────────────────────────────────────────────────

export type PersonRole = 'adult' | 'child'
export type ManagedBy = 'self' | 'parent'

export interface Person {
  id: string
  name: string
  role: PersonRole
  managedBy: ManagedBy
}

export interface Family {
  version: 1
  name: string
  homeTimezone: string
  people: Person[]
}

// ── templates/<type-id>.json ─────────────────────────────────────────────────

export interface PackingItemTemplate {
  name: string
  qty?: number
}

export interface TemplateTask {
  id: string
  kind: TaskKind
  title: string
  notes: string
  phase: Phase
  due: Due
  perTraveller: boolean
  assigneeRole: 'adult' | 'anyone'
  checklist: string[]
  fields: Record<string, unknown>
}

export interface TripTemplate {
  version: 1
  id: string
  name: string
  tasks: TemplateTask[]
  packing: {
    child: PackingItemTemplate[]
    adultDefault: PackingItemTemplate[]
    byPerson: Record<string, PackingItemTemplate[]>
  }
}

// ── trips/<trip-id>.json ─────────────────────────────────────────────────────

export type LegKind = 'drive' | 'flight' | 'train' | 'ferry' | 'stay' | 'wait' | 'other'

export interface LocalTime {
  local: string // "2027-02-14T06:30" (no offset); '' when not known yet
  tz: string // IANA zone
}

export interface LegDetails {
  flightNumber?: string
  carrier?: string
  bookingRef?: string
  terminal?: string
  address?: string
  phone?: string
  notes?: string
}

export interface Leg {
  id: string
  kind: LegKind
  title: string
  from: string
  to: string
  departAt: LocalTime
  arriveAt: LocalTime
  details: LegDetails
  attachmentIds: string[]
}

export type BagKind = 'hold' | 'cabin'

export interface Bag {
  id: string
  name: string
  ownerId: string | null
  kind: BagKind
  maxKg: number | null
  measuredKg: number | null
  measuredAt: ISODateTime | null
}

export type BookingKind = 'parking' | 'carHire' | 'accommodation' | 'other'

export interface Booking {
  id: string
  kind: BookingKind
  provider: string
  reference: string
  cost: number | null
  currency: string
  fields: Record<string, string>
  attachmentIds: string[]
}

export interface Attachment {
  id: string
  name: string
  path: string
  mime: string
  sizeBytes: number
  keepOffline: boolean
  addedBy: string
  addedAt: ISODateTime
}

export type Phase = 'before' | 'during' | 'after'
export type TaskStatus = 'todo' | 'done'
export type TaskKind = 'generic' | 'booking' | 'checkin' | 'weighBag' | 'pack' | 'documents'

export type DueAnchor = 'departure' | 'return' | { legId: string }

export type Due =
  | { kind: 'relative'; anchor: DueAnchor; offsetHours: number }
  | { kind: 'fixed'; at: ISODateTime }
  | { kind: 'none' }

export interface ChecklistItem {
  id: string
  name: string
  done: boolean
}

// Kind-specific fields. Stored loosely as `fields` on the task; these
// interfaces document the expected shape for each kind.
export interface BookingTaskFields {
  bookingKind: BookingKind
  bookingId?: string
  provider?: string
  reference?: string
  cost?: number | null
  currency?: string
  address?: string
  dropOffAt?: string
  pickUpAt?: string
  returnAt?: string
}

export type CheckinOpens =
  | { kind: 'relative'; hoursBefore: number }
  | { kind: 'fixed'; at: ISODateTime }

export interface CheckinTaskFields {
  legId: string | null
  opens: CheckinOpens
  passesInAirlineApp: boolean
  // personId -> attachmentId of their boarding pass
  boardingPasses: Record<string, string>
}

export interface WeighBagTaskFields {
  bagId: string | null
}

export interface PackTaskFields {
  personId: string
}

export interface DocumentCheck {
  personId: string
  docType: string
  expires: string | null // YYYY-MM-DD
  checked: boolean
}

export interface DocumentsTaskFields {
  checks: DocumentCheck[]
}

export interface Task {
  id: string
  kind: TaskKind
  title: string
  notes: string
  assigneeId: string | null
  phase: Phase
  due: Due
  status: TaskStatus
  completedBy: string | null
  completedAt: ISODateTime | null
  checklist: ChecklistItem[]
  fields: Record<string, unknown>
  attachmentIds: string[]
  templateId: string | null
  updatedAt: ISODateTime
}

export interface Trip {
  version: 1
  id: string
  name: string
  /** YYYY-MM-DD, entered at creation. Used for the countdown until legs give an exact time. */
  startDate: string
  typeIds: string[]
  travellers: string[]
  notes: string
  legs: Leg[]
  returnStartsAtLegId: string | null
  bookings: Booking[]
  bags: Bag[]
  tasks: Task[]
  attachments: Attachment[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

// ── trips/<trip-id>/packing/<person-id>.json ─────────────────────────────────

export interface PackingItem {
  id: string
  name: string
  qty: number | null
  needToBuy: boolean
  bought: boolean
  packed: boolean
  updatedAt: ISODateTime
}

export interface PackingList {
  version: 1
  personId: string
  items: PackingItem[]
  updatedAt: ISODateTime
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const LEG_KINDS: LegKind[] = ['drive', 'flight', 'train', 'ferry', 'stay', 'wait', 'other']
export const TASK_KINDS: TaskKind[] = ['generic', 'booking', 'checkin', 'weighBag', 'pack', 'documents']
export const PHASES: Phase[] = ['before', 'during', 'after']
export const BOOKING_KINDS: BookingKind[] = ['parking', 'carHire', 'accommodation', 'other']

export const LEG_KIND_LABELS: Record<LegKind, string> = {
  drive: 'Drive',
  flight: 'Flight',
  train: 'Train',
  ferry: 'Ferry',
  stay: 'Stay',
  wait: 'Wait',
  other: 'Other',
}

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  generic: 'Task',
  booking: 'Booking',
  checkin: 'Check-in',
  weighBag: 'Weigh bag',
  pack: 'Pack',
  documents: 'Documents',
}

export const BOOKING_KIND_LABELS: Record<BookingKind, string> = {
  parking: 'Airport parking',
  carHire: 'Car hire',
  accommodation: 'Accommodation',
  other: 'Other booking',
}

export const PHASE_LABELS: Record<Phase, string> = {
  before: 'Before departure',
  during: 'During the trip',
  after: 'After return',
}
