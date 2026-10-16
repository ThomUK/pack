<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { tripOps, templateOps } from '@/lib/ops'
import { uid, nowIso } from '@/lib/ids'
import { checkinOpensDate, fmtDateTime, describeDue, sortedLegs, endDate, countdown } from '@/lib/time'
import { packingCompletion } from '@/lib/progress'
import { prepareFile } from '@/lib/files'
import { mergeTemplateTasks } from '@/lib/trip-factory'
import {
  TASK_KIND_LABELS,
  PHASES,
  PHASE_LABELS,
  BOOKING_KINDS,
  BOOKING_KIND_LABELS,
  type Task,
  type TemplateTask,
  type TripTemplate,
  type Booking,
  type BookingKind,
  type CheckinTaskFields,
  type DocumentsTaskFields,
  type WeighBagTaskFields,
  type PackTaskFields,
} from '@/lib/models'
import Sheet from '@/components/Sheet.vue'
import DueEditor from '@/components/DueEditor.vue'
import AttachmentList from '@/components/AttachmentList.vue'
import Progress from '@/components/Progress.vue'

const props = defineProps<{ id: string; taskId: string }>()
const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()

const trip = computed(() => repo.trip(props.id))
const task = computed(() => trip.value?.tasks.find((t) => t.id === props.taskId) ?? null)
const people = computed(() => repo.family?.people ?? [])
const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')
const me = computed(() => repo.me())
const travellers = computed(() => people.value.filter((p) => trip.value?.travellers.includes(p.id)))
const personName = (id: string | null) => people.value.find((p) => p.id === id)?.name ?? 'Anyone'

const commit = (op: ReturnType<typeof tripOps.updateTask>) => trip.value && repo.commitTrip(trip.value.id, op)
const patch = (p: Partial<Task>) => task.value && commit(tripOps.updateTask(task.value.id, p))
const setFields = (f: Record<string, unknown>) => task.value && commit(tripOps.setTaskFields(task.value.id, f))

// ── typed field views ──────────────────────────────────────────────────────
const checkin = computed(() => (task.value?.kind === 'checkin' ? (task.value.fields as unknown as CheckinTaskFields) : null))
const weigh = computed(() => (task.value?.kind === 'weighBag' ? (task.value.fields as unknown as WeighBagTaskFields) : null))
const pack = computed(() => (task.value?.kind === 'pack' ? (task.value.fields as unknown as PackTaskFields) : null))
const docs = computed(() => (task.value?.kind === 'documents' ? (task.value.fields as unknown as DocumentsTaskFields) : null))
const booking = computed(() => (task.value?.kind === 'booking' ? task.value.fields : null))

const flightLegs = computed(() => (trip.value ? sortedLegs(trip.value).filter((l) => l.kind === 'flight' || l.kind === 'train' || l.kind === 'ferry') : []))
const checkinOpensAt = computed(() => (trip.value && checkin.value ? checkinOpensDate(trip.value, checkin.value.legId, checkin.value.opens) : null))
const checkinOpensIn = computed(() => (checkinOpensAt.value ? countdown(checkinOpensAt.value, ui.now) : null))
const opensAmount = computed(() => (checkin.value?.opens.kind === 'relative' ? (checkin.value.opens.hoursBefore % 24 === 0 ? checkin.value.opens.hoursBefore / 24 : checkin.value.opens.hoursBefore) : 0))
const opensUnit = computed(() => (checkin.value?.opens.kind === 'relative' && checkin.value.opens.hoursBefore % 24 === 0 ? 'days' : 'hours'))
function setOpensRelative(amount: number, unit: string) {
  setFields({ opens: { kind: 'relative', hoursBefore: unit === 'days' ? amount * 24 : amount } })
}
function setOpensFixed(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) setFields({ opens: { kind: 'fixed', at: new Date(v).toISOString() } })
}
function fixedOpensLocal(): string {
  if (checkin.value?.opens.kind !== 'fixed') return ''
  const d = new Date(checkin.value.opens.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const passInputs = ref<Record<string, HTMLInputElement | null>>({})
async function attachPass(personId: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !trip.value || !task.value || !checkin.value) return
  try {
    const prepared = await prepareFile(file)
    const att = await repo.uploadAttachment(trip.value.id, { ...prepared, name: `${personName(personId)} boarding pass${prepared.name.match(/\.[^.]+$/)?.[0] ?? ''}` }, { taskId: task.value.id }, true)
    setFields({ boardingPasses: { ...checkin.value.boardingPasses, [personId]: att.id } })
    ui.toast('Boarding pass saved for offline', 'success')
  } catch (err) {
    ui.toast(`Upload failed: ${err instanceof Error ? err.message : err}`, 'error')
  }
}
const passAttachment = (personId: string) => trip.value?.attachments.find((a) => a.id === checkin.value?.boardingPasses[personId]) ?? null

const bag = computed(() => trip.value?.bags.find((b) => b.id === weigh.value?.bagId) ?? null)
const measured = ref<number | null>(null)
watch(bag, (b) => (measured.value = b?.measuredKg ?? null), { immediate: true })
function saveWeight() {
  if (!trip.value || !bag.value || measured.value == null) return
  repo.commitTrip(trip.value.id, tripOps.updateBag(bag.value.id, { measuredKg: measured.value, measuredAt: nowIso() }))
}
const overLimit = computed(() => bag.value && measured.value != null && bag.value.maxKg != null && measured.value > bag.value.maxKg)

const packingList = computed(() => (trip.value && pack.value ? repo.packing(trip.value.id, pack.value.personId) : null))
const packingProgress = computed(() => packingCompletion(packingList.value))

const tripEnd = computed(() => (trip.value ? endDate(trip.value) : null))
function docExpiryWarning(expires: string | null): string | null {
  if (!expires || !tripEnd.value) return null
  const exp = new Date(expires + 'T00:00:00')
  if (exp < tripEnd.value) return 'Expires before the trip ends!'
  const sixMonths = new Date(tripEnd.value.getTime() + 183 * 86400000)
  if (exp < sixMonths) return 'Less than 6 months left after the trip; some countries require more.'
  return null
}
function setCheck(i: number, p: Partial<DocumentsTaskFields['checks'][number]>) {
  if (!docs.value) return
  const checks = docs.value.checks.map((c, idx) => (idx === i ? { ...c, ...p } : c))
  setFields({ checks })
}
function addCheck() {
  if (!docs.value) return
  setFields({ checks: [...docs.value.checks, { personId: travellers.value[0]?.id ?? '', docType: 'EHIC / GHIC', expires: null, checked: false }] })
}
function removeCheck(i: number) {
  if (!docs.value) return
  setFields({ checks: docs.value.checks.filter((_, idx) => idx !== i) })
}

// Booking fields
const bookingKind = computed(() => (booking.value?.bookingKind as BookingKind) ?? 'other')
function setBooking(f: Record<string, unknown>) {
  setFields(f)
}
function syncBookingRecord() {
  const t = trip.value
  const tk = task.value
  if (!t || !tk || !booking.value) return
  const f = booking.value
  if (!f.provider && !f.reference) return
  const id = (f.bookingId as string | undefined) ?? uid()
  const fields: Record<string, string> = {}
  for (const k of ['address', 'dropOffAt', 'pickUpAt', 'returnAt']) if (f[k]) fields[k] = String(f[k])
  const b: Booking = {
    id,
    kind: bookingKind.value,
    provider: String(f.provider ?? ''),
    reference: String(f.reference ?? ''),
    cost: typeof f.cost === 'number' ? f.cost : null,
    currency: String(f.currency ?? 'GBP'),
    fields,
    attachmentIds: tk.attachmentIds,
  }
  repo.commitTrip(t.id, tripOps.upsertBooking(b))
  if (!f.bookingId) setFields({ bookingId: id })
}

// ── completion rules ───────────────────────────────────────────────────────
const blocker = computed<string | null>(() => {
  const t = task.value
  if (!t || t.status === 'done') return null
  switch (t.kind) {
    case 'booking':
      return booking.value?.provider && booking.value?.reference ? null : 'Enter the provider and booking reference first.'
    case 'checkin': {
      if (!checkin.value?.legId) return 'Pick which flight this is for.'
      if (checkin.value.passesInAirlineApp) return null
      const missing = travellers.value.filter((p) => !checkin.value!.boardingPasses[p.id])
      return missing.length ? `Attach boarding passes for ${missing.map((p) => p.name).join(', ')}, or tick "passes are in the airline app".` : null
    }
    case 'weighBag':
      if (!bag.value) return 'Pick a bag.'
      if (bag.value.measuredKg == null) return 'Enter the measured weight.'
      return null
    case 'pack':
      return packingProgress.value.total && packingProgress.value.done < packingProgress.value.total ? `${packingProgress.value.total - packingProgress.value.done} items still to pack.` : null
    case 'documents':
      return docs.value?.checks.every((c) => c.checked) ? null : 'Tick every document once checked.'
    default:
      return null
  }
})
function toggleDone() {
  const t = task.value
  if (!t || !me.value || !trip.value) return
  if (t.status !== 'done' && blocker.value) {
    ui.toast(blocker.value, 'error', 4000)
    return
  }
  if (t.kind === 'booking' && t.status !== 'done') syncBookingRecord()
  repo.commitTrip(trip.value.id, tripOps.setTaskStatus(t.id, t.status !== 'done', me.value.id))
}

// ── checklist ──────────────────────────────────────────────────────────────
const newItem = ref('')
function addChecklist() {
  if (!task.value || !newItem.value.trim()) return
  commit(tripOps.addChecklistItem(task.value.id, { id: uid(), name: newItem.value.trim(), done: false }))
  newItem.value = ''
}

// ── edit basics ────────────────────────────────────────────────────────────
const editing = ref(false)
const eTitle = ref('')
const eNotes = ref('')
const eAssignee = ref<string | null>(null)
const ePhase = ref<Task['phase']>('before')
const eDue = ref<Task['due']>({ kind: 'none' })
function openEdit() {
  if (!task.value) return
  eTitle.value = task.value.title
  eNotes.value = task.value.notes
  eAssignee.value = task.value.assigneeId
  ePhase.value = task.value.phase
  eDue.value = task.value.due
  editing.value = true
}
function saveEdit() {
  patch({ title: eTitle.value.trim() || task.value!.title, notes: eNotes.value, assigneeId: eAssignee.value, phase: ePhase.value, due: eDue.value })
  editing.value = false
}
function remove() {
  if (!task.value || !trip.value) return
  if (!confirm('Delete this task?')) return
  repo.commitTrip(trip.value.id, tripOps.removeTask(task.value.id))
  router.replace({ name: 'tasks', params: { id: trip.value.id } })
}

// ── save to template ───────────────────────────────────────────────────────
const tplSheet = ref(false)
const tripTemplates = computed(() => (trip.value ? trip.value.typeIds.map((id) => repo.template(id)).filter((t): t is TripTemplate => !!t) : []))
function toTemplateTask(t: Task): TemplateTask {
  const perTraveller = t.kind === 'pack' || / — .+$/.test(t.title)
  const fields: Record<string, unknown> = {}
  if (t.kind === 'booking') fields.bookingKind = t.fields.bookingKind ?? 'other'
  if (t.kind === 'checkin') fields.opens = t.fields.opens
  return {
    id: uid(),
    kind: t.kind,
    title: t.title.replace(/ — .+$/, ''),
    notes: t.notes,
    phase: t.phase,
    due: t.due.kind === 'fixed' ? { kind: 'relative', anchor: 'departure', offsetHours: -24 } : t.due,
    perTraveller,
    assigneeRole: 'anyone',
    checklist: t.checklist.map((c) => c.name),
    fields,
  }
}
function saveToTemplate() {
  if (!task.value) return
  if (tripTemplates.value.length === 1) {
    saveToExisting(tripTemplates.value[0]!)
    return
  }
  tplSheet.value = true
}
function saveToExisting(tpl: TripTemplate) {
  if (!task.value) return
  const tt = toTemplateTask(task.value)
  if (tpl.tasks.some((x) => x.title.toLowerCase() === tt.title.toLowerCase())) {
    ui.toast(`"${tt.title}" is already in ${tpl.name}`, 'info')
  } else {
    repo.commitTemplate(tpl.id, templateOps.upsertTask(tt))
    ui.toast(`Saved to ${tpl.name} for next time`, 'success')
  }
  tplSheet.value = false
}
async function saveToCombined() {
  if (!task.value || !trip.value) return
  const tpls = tripTemplates.value
  const id = tpls.map((t) => t.id).join('-')
  const existing = repo.template(id)
  if (existing) {
    saveToExisting(existing)
    return
  }
  const merged = mergeTemplateTasks(tpls).map(({ templateId: _tid, ...t }) => t)
  const combined: TripTemplate = {
    version: 1,
    id,
    name: tpls.map((t) => t.name).join(' + '),
    tasks: [...merged, toTemplateTask(task.value)],
    packing: {
      child: dedupe(tpls.flatMap((t) => t.packing.child)),
      adultDefault: dedupe(tpls.flatMap((t) => t.packing.adultDefault)),
      byPerson: Object.fromEntries(
        [...new Set(tpls.flatMap((t) => Object.keys(t.packing.byPerson)))].map((pid) => [pid, dedupe(tpls.flatMap((t) => t.packing.byPerson[pid] ?? t.packing.adultDefault))]),
      ),
    },
  }
  try {
    await repo.createTemplate(combined)
    ui.toast(`Created template "${combined.name}"`, 'success')
  } catch (e) {
    ui.toast(`Could not create template: ${e instanceof Error ? e.message : e}`, 'error')
  }
  tplSheet.value = false
}
function dedupe<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.name.toLowerCase()) ? false : (seen.add(i.name.toLowerCase()), true)))
}
</script>

<template>
  <div v-if="!trip || !task" class="page empty">Task not found.</div>
  <div v-else class="page">
    <div class="page-head">
      <router-link class="btn ghost" :to="{ name: 'tasks', params: { id: trip.id } }">‹ Tasks</router-link>
      <div class="row">
        <button class="ghost" @click="openEdit">Edit</button>
      </div>
    </div>

    <div class="card">
      <div class="row" style="align-items: flex-start">
        <input type="checkbox" class="check-big" :checked="task.status === 'done'" :disabled="!repo.canEdit" @click.prevent="toggleDone" />
        <div class="grow">
          <h1 style="font-size: 1.25rem" :class="{ done: task.status === 'done' }">{{ task.title }}</h1>
          <div class="row wrap small muted">
            <span class="chip">{{ TASK_KIND_LABELS[task.kind] }}</span>
            <span>{{ personName(task.assigneeId) }}</span>
            <span>· {{ PHASE_LABELS[task.phase] }}</span>
            <span v-if="describeDue(trip, task.due, homeTz, ui.now)">· {{ describeDue(trip, task.due, homeTz, ui.now) }}</span>
          </div>
          <p v-if="task.status === 'done'" class="small muted" style="margin-top: 0.3rem">Done by {{ personName(task.completedBy) }}{{ task.completedAt ? ' · ' + fmtDateTime(new Date(task.completedAt), homeTz) : '' }}</p>
          <p v-else-if="blocker" class="small due-today" style="margin-top: 0.3rem">{{ blocker }}</p>
        </div>
      </div>
      <p v-if="task.notes" style="white-space: pre-wrap; margin-top: 0.75rem">{{ task.notes }}</p>
    </div>

    <!-- Booking -->
    <div v-if="booking" class="card">
      <h2>Booking details</h2>
      <label class="field">
        <span>Type</span>
        <select :value="bookingKind" @change="setBooking({ bookingKind: ($event.target as HTMLSelectElement).value })">
          <option v-for="k in BOOKING_KINDS" :key="k" :value="k">{{ BOOKING_KIND_LABELS[k] }}</option>
        </select>
      </label>
      <div class="grid-2">
        <label class="field"><span>Provider</span><input type="text" :value="booking.provider ?? ''" @change="setBooking({ provider: ($event.target as HTMLInputElement).value })" /></label>
        <label class="field"><span>Reference</span><input type="text" :value="booking.reference ?? ''" @change="setBooking({ reference: ($event.target as HTMLInputElement).value })" /></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Cost</span><input type="number" step="0.01" :value="booking.cost ?? ''" @change="setBooking({ cost: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })" /></label>
        <label class="field"><span>Currency</span><input type="text" :value="booking.currency ?? 'GBP'" @change="setBooking({ currency: ($event.target as HTMLInputElement).value })" /></label>
      </div>
      <template v-if="bookingKind === 'parking'">
        <label class="field"><span>Car park address / instructions</span><textarea rows="2" :value="(booking.address as string) ?? ''" @change="setBooking({ address: ($event.target as HTMLTextAreaElement).value })" /></label>
        <div class="grid-2">
          <label class="field"><span>Drop-off</span><input type="datetime-local" :value="booking.dropOffAt ?? ''" @change="setBooking({ dropOffAt: ($event.target as HTMLInputElement).value })" /></label>
          <label class="field"><span>Pick-up</span><input type="datetime-local" :value="booking.pickUpAt ?? ''" @change="setBooking({ pickUpAt: ($event.target as HTMLInputElement).value })" /></label>
        </div>
      </template>
      <template v-else-if="bookingKind === 'carHire'">
        <label class="field"><span>Pick-up location</span><input type="text" :value="(booking.address as string) ?? ''" @change="setBooking({ address: ($event.target as HTMLInputElement).value })" /></label>
        <div class="grid-2">
          <label class="field"><span>Pick-up</span><input type="datetime-local" :value="booking.pickUpAt ?? ''" @change="setBooking({ pickUpAt: ($event.target as HTMLInputElement).value })" /></label>
          <label class="field"><span>Return</span><input type="datetime-local" :value="booking.returnAt ?? ''" @change="setBooking({ returnAt: ($event.target as HTMLInputElement).value })" /></label>
        </div>
      </template>
      <template v-else-if="bookingKind === 'accommodation'">
        <label class="field"><span>Address</span><textarea rows="2" :value="(booking.address as string) ?? ''" @change="setBooking({ address: ($event.target as HTMLTextAreaElement).value })" /></label>
      </template>
      <button class="small" :disabled="!repo.canEdit" @click="syncBookingRecord">Save booking to trip</button>
    </div>

    <!-- Check-in -->
    <div v-if="checkin" class="card">
      <h2>Check-in</h2>
      <label class="field">
        <span>Flight / journey</span>
        <select :value="checkin.legId ?? ''" @change="setFields({ legId: ($event.target as HTMLSelectElement).value || null })">
          <option value="" disabled>Choose a leg</option>
          <option v-for="l in flightLegs" :key="l.id" :value="l.id">{{ l.title }}<template v-if="l.details.flightNumber"> ({{ l.details.flightNumber }})</template></option>
        </select>
        <p v-if="!flightLegs.length" class="small muted">Add a flight leg to the trip itinerary first.</p>
      </label>
      <div class="field">
        <span class="small muted">Check-in opens</span>
        <div class="segmented" style="margin: 0.3rem 0">
          <button type="button" :class="{ on: checkin.opens.kind === 'relative' }" @click="setOpensRelative(opensAmount || 1, opensUnit)">Before departure</button>
          <button type="button" :class="{ on: checkin.opens.kind === 'fixed' }" @click="setFields({ opens: { kind: 'fixed', at: (checkinOpensAt ?? new Date()).toISOString() } })">Fixed time</button>
        </div>
        <div v-if="checkin.opens.kind === 'relative'" class="row">
          <input type="number" min="0" style="width: 90px" :value="opensAmount" @change="setOpensRelative(Number(($event.target as HTMLInputElement).value), opensUnit)" />
          <select style="width: auto" :value="opensUnit" @change="setOpensRelative(opensAmount, ($event.target as HTMLSelectElement).value)">
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span class="small muted">before departure</span>
        </div>
        <input v-else type="datetime-local" :value="fixedOpensLocal()" @change="setOpensFixed" />
        <p v-if="checkinOpensAt" class="small" style="margin-top: 0.3rem">
          Opens {{ fmtDateTime(checkinOpensAt, homeTz) }}
          <span v-if="checkinOpensIn && !checkinOpensIn.past" class="muted">· in {{ checkinOpensIn.days }}d {{ checkinOpensIn.hours }}h</span>
          <span v-else class="chip ok">open now</span>
        </p>
      </div>
      <h3>Boarding passes</h3>
      <ul class="list">
        <li v-for="p in travellers" :key="p.id">
          <div class="grow">
            {{ p.name }}
            <div class="small muted">{{ passAttachment(p.id) ? passAttachment(p.id)!.name + ' · kept offline' : 'No pass yet' }}</div>
          </div>
          <input :ref="(el) => (passInputs[p.id] = el as HTMLInputElement)" type="file" accept="image/*,application/pdf" hidden @change="attachPass(p.id, $event)" />
          <button class="small" :disabled="!repo.canEdit" @click="passInputs[p.id]?.click()">{{ passAttachment(p.id) ? 'Replace' : 'Attach' }}</button>
        </li>
      </ul>
      <label class="checkbox"><input type="checkbox" :checked="checkin.passesInAirlineApp" @change="setFields({ passesInAirlineApp: ($event.target as HTMLInputElement).checked })" /> <span>Passes are in the airline app</span></label>
    </div>

    <!-- Weigh bag -->
    <div v-if="weigh" class="card">
      <h2>Weigh bag</h2>
      <label class="field">
        <span>Bag</span>
        <select :value="weigh.bagId ?? ''" @change="setFields({ bagId: ($event.target as HTMLSelectElement).value || null })">
          <option value="" disabled>Choose a bag</option>
          <option v-for="b in trip.bags" :key="b.id" :value="b.id">{{ b.name }} · {{ personName(b.ownerId) === 'Anyone' ? 'shared' : personName(b.ownerId) }}<template v-if="b.maxKg != null"> · max {{ b.maxKg }} kg</template></option>
        </select>
        <p v-if="!trip.bags.length" class="small muted">Add bags on the trip page first (the bags section appears once the itinerary has a flight).</p>
      </label>
      <div v-if="bag" class="row">
        <input v-model.number="measured" type="number" step="0.1" min="0" placeholder="kg" style="width: 120px" />
        <button :disabled="measured == null || !repo.canEdit" @click="saveWeight">Save weight</button>
        <span v-if="overLimit" class="chip danger">Over the {{ bag.maxKg }} kg limit</span>
        <span v-else-if="bag.measuredKg != null" class="chip ok">{{ bag.measuredKg }} kg</span>
      </div>
    </div>

    <!-- Pack -->
    <div v-if="pack" class="card">
      <h2>Packing — {{ personName(pack.personId) }}</h2>
      <Progress :done="packingProgress.done" :total="packingProgress.total" />
      <router-link class="btn" style="margin-top: 0.6rem" :to="{ name: 'packing', params: { id: trip.id, personId: pack.personId } }">Open packing list</router-link>
    </div>

    <!-- Documents -->
    <div v-if="docs" class="card">
      <h2>Documents</h2>
      <ul class="list">
        <li v-for="(c, i) in docs.checks" :key="i" style="align-items: flex-start">
          <input type="checkbox" class="check-big" :checked="c.checked" @change="setCheck(i, { checked: ($event.target as HTMLInputElement).checked })" />
          <div class="grow">
            <div class="row">
              <select style="width: auto" :value="c.personId" @change="setCheck(i, { personId: ($event.target as HTMLSelectElement).value })">
                <option v-for="p in travellers" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <input class="grow" type="text" :value="c.docType" @change="setCheck(i, { docType: ($event.target as HTMLInputElement).value })" />
            </div>
            <div class="row" style="margin-top: 0.3rem">
              <span class="small muted">Expires</span>
              <input type="date" style="width: auto" :value="c.expires ?? ''" @change="setCheck(i, { expires: ($event.target as HTMLInputElement).value || null })" />
            </div>
            <div v-if="docExpiryWarning(c.expires)" class="small overdue">{{ docExpiryWarning(c.expires) }}</div>
          </div>
          <button class="ghost small danger" @click="removeCheck(i)">✕</button>
        </li>
      </ul>
      <button class="small" style="margin-top: 0.5rem" @click="addCheck">+ Document</button>
    </div>

    <!-- Checklist -->
    <div v-if="task.checklist.length || task.kind === 'generic'" class="card">
      <h2>Checklist</h2>
      <ul class="list">
        <li v-for="c in task.checklist" :key="c.id">
          <input type="checkbox" class="check-big" :checked="c.done" @change="commit(tripOps.setChecklistItem(task!.id, c.id, ($event.target as HTMLInputElement).checked))" />
          <span class="grow" :class="{ done: c.done }">{{ c.name }}</span>
          <button class="ghost small danger" @click="commit(tripOps.removeChecklistItem(task!.id, c.id))">✕</button>
        </li>
      </ul>
      <form class="row" style="margin-top: 0.5rem" @submit.prevent="addChecklist">
        <input v-model="newItem" class="grow" type="text" placeholder="Add an item" />
        <button type="submit" :disabled="!newItem.trim()">Add</button>
      </form>
    </div>

    <div class="card">
      <h2>Files</h2>
      <AttachmentList :trip-id="trip.id" :attachment-ids="task.attachmentIds" :target="{ taskId: task.id, bookingId: (task.fields.bookingId as string | undefined) }" />
    </div>

    <div class="row wrap" style="margin-top: 1rem">
      <button :disabled="!repo.canEdit" @click="saveToTemplate">Save to template for next time</button>
      <button class="danger" :disabled="!repo.canEdit" @click="remove">Delete task</button>
    </div>

    <Sheet v-if="editing" title="Edit task" @close="editing = false">
      <form class="stack" @submit.prevent="saveEdit">
        <label class="field"><span>Title</span><input v-model="eTitle" type="text" required /></label>
        <label class="field"><span>Notes</span><textarea v-model="eNotes" rows="3" /></label>
        <div class="grid-2">
          <label class="field">
            <span>Assigned to</span>
            <select v-model="eAssignee">
              <option :value="null">Anyone</option>
              <option v-for="p in travellers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Phase</span>
            <select v-model="ePhase"><option v-for="p in PHASES" :key="p" :value="p">{{ PHASE_LABELS[p] }}</option></select>
          </label>
        </div>
        <DueEditor v-model="eDue" :trip="trip" :home-timezone="homeTz" />
        <button type="submit" class="primary block">Save</button>
      </form>
    </Sheet>

    <Sheet v-if="tplSheet" title="Save to which template?" @close="tplSheet = false">
      <div class="stack">
        <button v-for="t in tripTemplates" :key="t.id" class="block" @click="saveToExisting(t)">{{ t.name }}</button>
        <button class="block primary" @click="saveToCombined">New combined template: {{ tripTemplates.map((t) => t.name).join(' + ') }}</button>
      </div>
    </Sheet>
  </div>
</template>
