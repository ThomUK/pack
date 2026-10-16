# Pack — family travel planning and packing app

Specification agreed on 2026-10-16. This document is the contract for v1. Anything
not listed under "Later" is in scope for v1 unless marked otherwise.

## 1. Purpose

Help one family (initially four people, configurable for other families later) get
ready for holidays and weekends away. A trip is configured by type(s), legs, who is
going, and the tasks that must be done. The app shows a countdown to departure
with task completeness, and a second countdown for the return journey.

## 2. Architecture

Same pattern as [personal-todo](https://github.com/ThomUK/personal-todo): a static
web app plus a private data repo accessed via the GitHub Contents API.

| Repo | Purpose |
|---|---|
| `ThomUK/pack` | App code. Vue 3 + Vite + TypeScript. Built and deployed to GitHub Pages by GitHub Actions. |
| `ThomUK/pack-data` (private) | All family data as JSON and attachment files. Created by the user; scaffolded by the app on first run. |

- **No backend.** All reads and writes go browser → GitHub API.
- **One shared fine-grained token** (Contents: read and write on `pack-data`), entered
  in the app and kept in `localStorage`. No token = no access.
- **Identity**: after the token, the device picks "I am …" from the family. Stored in
  `localStorage`. The person's name goes into every commit message so git history
  records who did what.
- **Mobile first.** Installable PWA (manifest + service worker). Planned for a later
  Capacitor wrapper but no Capacitor-specific code in v1.
- **Offline**: last-known state is cached and shown read-only. Edits are blocked with a
  clear "offline" indicator. Attachments marked "keep offline" are cached too.
- **Freshness**: reload data when the app regains focus and every 60 s while visible.

## 3. Data repo layout

```
family.json                          people + settings
templates/<type-id>.json             one per trip type (ski, camping, hotel, …)
trips/<trip-id>.json                 trip, legs, bookings, bags, tasks
trips/<trip-id>/packing/<person-id>.json
trips/<trip-id>/files/<file-id>-<name>   attachments
```

`trip-id` = `<start-date>-<slug>` e.g. `2027-02-14-tignes-ski`, generated on
creation. Renaming the trip later keeps the id.

Per-person packing lists live in separate files so simultaneous packing by several
people never touches the same file.

### 3.1 `family.json`

```ts
{
  version: 1,
  name: string,                 // "The Smiths"
  homeTimezone: string,         // IANA, e.g. "Europe/London"
  people: Person[]
}
Person {
  id: string,
  name: string,
  role: 'adult' | 'child',
  managedBy: 'self' | 'parent'  // 'parent' = any adult manages their tasks
}
```

### 3.2 `templates/<type-id>.json`

```ts
{
  version: 1,
  id: string,                   // "ski"
  name: string,                 // "Ski trip"
  tasks: TemplateTask[],        // see §5; dueOffset relative to departure/return
  packing: {
    child: PackingItemTemplate[],
    adultDefault: PackingItemTemplate[],
    byPerson: { [personId: string]: PackingItemTemplate[] }   // adult personal lists
  }
}
PackingItemTemplate { name: string, qty?: number }
```

A trip may use several templates; task lists and packing lists are merged on
creation (duplicate names collapsed). Templates are starting points only: changing a
template never changes existing trips. Adding a task or packing item to a trip
offers "save to template for next time"; on a multi-type trip the user picks which
template receives it, or creates a new combined template.

Starter templates scaffolded on first run: `ski`, `camping`, `hotel`, `weekend`.

### 3.3 `trips/<trip-id>.json`

```ts
{
  version: 1,
  id: string,
  name: string,
  typeIds: string[],
  travellers: string[],         // person ids (family members only in v1)
  notes: string,
  legs: Leg[],
  returnStartsAtLegId: string | null,  // null = auto: first leg after the last 'stay'
  bookings: Booking[],
  bags: Bag[],
  tasks: Task[],
  attachments: Attachment[],
  createdAt, updatedAt: string  // ISO
}

Leg {
  id: string,
  kind: 'drive' | 'flight' | 'train' | 'ferry' | 'stay' | 'wait' | 'other',
  title: string,                // "Fly MAN → GVA"
  from: string, to: string,     // free text; for 'stay'/'wait' use location
  departAt: LocalTime,          // for 'stay': check-in; for 'wait': start
  arriveAt: LocalTime,          // for 'stay': check-out; for 'wait': end
  details: {                    // kind-specific, all optional
    flightNumber?, carrier?, bookingRef?, terminal?,
    address?, phone?,
    notes?
  },
  attachmentIds: string[]
}
LocalTime { local: string /* "2027-02-14T06:30" */, tz: string /* IANA */ }

Bag {
  id: string,
  name: string,                 // "Big red suitcase"
  ownerId: string | null,       // person, or null = shared
  kind: 'hold' | 'cabin',
  maxKg: number | null,
  measuredKg: number | null,
  measuredAt: string | null
}

Booking {                       // created by booking tasks, see §5
  id, kind: 'parking' | 'carHire' | 'accommodation' | 'other',
  provider, reference, cost, currency,
  fields: { ... },              // kind-specific (address, dropOffAt, pickUpAt, …)
  attachmentIds: string[]
}

Attachment {
  id: string,
  name: string,
  path: string,                 // in data repo
  mime: string,
  sizeBytes: number,
  keepOffline: boolean,
  addedBy: string, addedAt: string
}
```

Times abroad: every `LocalTime` is displayed as local time **and** home time
(e.g. "10:00 CET · 09:00 UK") whenever `tz` differs from `homeTimezone`.

Departure = `legs[0].departAt`. Return start = `returnStartsAtLegId` or the
first leg after the last `stay`. The trip archives automatically one day after the
last leg's `arriveAt` (computed, not stored).

### 3.4 `trips/<trip-id>/packing/<person-id>.json`

```ts
{
  version: 1,
  personId: string,
  items: PackingItem[],
  updatedAt: string
}
PackingItem {
  id: string,
  name: string,
  qty: number | null,
  needToBuy: boolean,           // surfaces on the shopping list
  bought: boolean,
  packed: boolean,
  updatedAt: string
}
```

## 4. Sync and conflict handling

- Every save sends the file's last-known SHA. On a `409`/"does not match" error:
  1. reload the file,
  2. replay this device's pending operations on the fresh copy,
  3. save again (retry up to 3 times, then show "someone else changed this, reload").
- Every edit is expressed as a small **operation** (e.g. `setTaskStatus(taskId, 'done')`,
  `setPackingItem(itemId, {packed: true})`) rather than a whole-file overwrite, so
  replay merges cleanly with other people's changes. Same item edited by two people
  resolves last-writer-wins.
- Commit message format: `<person name>: <operation summary>`.
- Every task and packing item records `updatedAt`; tasks also record `completedBy`
  and `completedAt`. History is captured in git but not surfaced in the v1 UI.

## 5. Tasks

```ts
Task {
  id: string,
  kind: TaskKind,
  title: string,
  notes: string,
  assigneeId: string | null,    // person, or null = anyone
  phase: 'before' | 'during' | 'after',
  due: Due,
  status: 'todo' | 'done',
  completedBy: string | null, completedAt: string | null,
  checklist: ChecklistItem[],   // optional sub-items on any task
  fields: object,               // kind-specific, see below
  attachmentIds: string[],
  templateId: string | null,    // which template it came from
  updatedAt: string
}
Due =
  | { kind: 'relative', anchor: 'departure' | 'return' | { legId: string }, offsetHours: number }
  | { kind: 'fixed', at: string }
  | { kind: 'none' }
ChecklistItem { id, name, done }
```

Template tasks marked `perTraveller: true` expand to one task per traveller at trip
creation and when a traveller is added later.

### 5.1 Task kinds (v1)

Typed kinds require their fields before the task can be marked done.

| kind | required fields | done when |
|---|---|---|
| `generic` | title | ticked |
| `booking` | bookingKind, provider, reference; parking also address + dropOffAt; carHire also pickUpAt/returnAt; accommodation also address | ticked, creates/updates a `Booking` |
| `checkin` | legId, opensAt (user-configurable: N hours/days before the leg, or a fixed date/time; airlines vary from 24 h to a month) | boarding pass attached per traveller, or "passes are in the airline app" ticked |
| `weighBag` | bagId, measuredKg | weight entered; warns when over `maxKg` |
| `pack` | personId (links to that person's packing file) | all items packed |
| `documents` | per traveller: document type + expiry date | all travellers checked |

Dependencies between tasks: **later**, not v1.

## 6. Views

1. **Countdown (home)**: days/hours to departure; overall completion % of `before`
   tasks; breakdown by person; overdue and due-soon lists; shopping list (all
   `needToBuy && !bought` items across travellers); second countdown and task set
   for the return journey once departure has passed (or on demand).
2. **Trip itinerary**: legs in order with local + home times; bookings; bags with
   weights vs allowance.
3. **Tasks**: filter by "mine" (own tasks plus managed children's), person, phase.
4. **Packing**: per person; tick packed; flag need-to-buy; delete items that don't
   apply; add items; import plain text (one item per line); "save to template".
5. **Trips list**: upcoming, current, archived; create from template(s); clone any
   trip (including archived) as the starting point for a new one.
6. **Setup / settings**: token, repo (default `pack-data`), family members, home
   timezone, "I am …".

## 7. Attachments

- Stored in the data repo under `trips/<trip-id>/files/`.
- Images are downscaled in the browser to ~1600 px on the long edge before upload.
  PDFs uploaded as-is. Soft limit ~5 MB per file (Contents API practical limit).
- **Share target**: the PWA registers a Web Share Target so Android's "share with"
  sheet can send a file/screenshot straight into the app; the app then asks which
  trip/task/leg it belongs to. An in-app "attach file" button is the universal
  fallback. iOS has no equivalent today; revisit when it does.
- `keepOffline: true` attachments (e.g. boarding passes) are cached on the device
  for viewing without signal.

## 8. Notifications

No server, so no push in v1. In-app badges for overdue and due-soon tasks, and
"add to calendar" (.ics) for key deadlines such as check-in opening. Real
notifications arrive with the Capacitor wrapper later.

## 9. First run

1. Enter token, owner, repo (`pack-data`), branch.
2. If `family.json` is missing: family setup wizard (name, home timezone, add people
   with role and managed-by), then the app writes `family.json` and the starter
   templates.
3. Pick "I am …".

## 10. Later (explicitly out of v1)

- Task dependencies / ordering
- Non-family guests on a trip
- History UI
- Push notifications (via Capacitor)
- iOS share target
- Capacitor Android build
- Multiple families in one app install (one data repo per family already allows
  separate deployments)
