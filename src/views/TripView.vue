<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { tripOps } from '@/lib/ops'
import { uid, nowIso } from '@/lib/ids'
import { sortedLegs, returnLeg, tripState, fmtDate, localTimeToDate, dateToLocalTime, hasTime, tripStartDate } from '@/lib/time'
import { setupTodos, hasFlight, type SetupTodo } from '@/lib/setup-todos'
import SetupTodoList from '@/components/SetupTodoList.vue'
import { tasksForNewTraveller, packingForNewTraveller } from '@/lib/trip-factory'
import { LEG_KIND_LABELS, BOOKING_KIND_LABELS, type Leg, type Bag } from '@/lib/models'
import Sheet from '@/components/Sheet.vue'
import LegForm from '@/components/LegForm.vue'
import DualTime from '@/components/DualTime.vue'
import PersonChips from '@/components/PersonChips.vue'
import AttachmentList from '@/components/AttachmentList.vue'

const props = defineProps<{ id: string }>()
const repo = useRepoStore()
const cfg = useConfigStore()
const ui = useUiStore()
const router = useRouter()

const trip = computed(() => repo.trip(props.id))
const family = computed(() => repo.family)
const homeTz = computed(() => family.value?.homeTimezone ?? 'UTC')
const people = computed(() => family.value?.people ?? [])
const legs = computed(() => (trip.value ? sortedLegs(trip.value) : []))
const retLeg = computed(() => (trip.value ? returnLeg(trip.value) : null))
const state = computed(() => (trip.value ? tripState(trip.value, ui.now) : 'unscheduled'))
const isCurrent = computed(() => cfg.config.currentTripId === props.id)
const startDate = computed(() => (trip.value ? tripStartDate(trip.value) : null))
const showBags = computed(() => !!trip.value && (hasFlight(trip.value) || trip.value.bags.length > 0))
const todos = computed(() => (trip.value ? setupTodos(trip.value, people.value, repo.packingLists(trip.value.id)) : []))
function goTodo(t: SetupTodo) {
  const tr = trip.value
  if (!tr) return
  switch (t.target.kind) {
    case 'legs':
      newLeg()
      break
    case 'leg': {
      const l = tr.legs.find((x) => x.id === (t.target as { legId: string }).legId)
      if (l) editLeg(l)
      break
    }
    case 'bags':
      newBag('hold')
      break
    case 'travellers':
      openEdit()
      break
    case 'task':
      router.push({ name: 'task', params: { id: tr.id, taskId: t.target.taskId } })
      break
    case 'packing':
      router.push({ name: 'packing', params: { id: tr.id, personId: t.target.personId } })
      break
  }
}

const personName = (id: string | null) => people.value.find((p) => p.id === id)?.name ?? (id ? id : 'Shared')

// ── edit details ───────────────────────────────────────────────────────────
const editing = ref(false)
const draftName = ref('')
const draftNotes = ref('')
const draftStart = ref('')
const draftTravellers = ref<string[]>([])
function openEdit() {
  if (!trip.value) return
  draftName.value = trip.value.name
  draftNotes.value = trip.value.notes
  draftStart.value = tripStartDate(trip.value) ?? ''
  draftTravellers.value = [...trip.value.travellers]
  editing.value = true
}
async function saveEdit() {
  const t = trip.value
  if (!t || !family.value) return
  repo.commitTrip(t.id, tripOps.patch({ name: draftName.value.trim() || t.name, notes: draftNotes.value, travellers: draftTravellers.value, startDate: draftStart.value || t.startDate }))
  // New travellers get their per-traveller tasks and a packing list.
  const added = draftTravellers.value.filter((id) => !t.travellers.includes(id))
  const templates = repo.templates
  for (const id of added) {
    const person = people.value.find((p) => p.id === id)
    if (!person) continue
    const tasks = tasksForNewTraveller(t, templates, person)
    if (tasks.length) repo.commitTrip(t.id, tripOps.addTasks(tasks))
    if (!repo.packing(t.id, id)) {
      try {
        await repo.createPackingList(t.id, packingForNewTraveller(t, templates, person))
      } catch (e) {
        ui.toast(`Could not create packing list for ${person.name}`, 'error')
      }
    }
  }
  editing.value = false
}

// ── legs ───────────────────────────────────────────────────────────────────
const legSheet = ref<{ leg: Leg; isNew: boolean } | null>(null)
function newLeg() {
  const last = legs.value.filter((l) => hasTime(l.arriveAt)).at(-1)
  const tz = last?.arriveAt.tz ?? homeTz.value
  const startLocal = last ? last.arriveAt.local : `${startDate.value ?? new Date().toISOString().slice(0, 10)}T08:00`
  legSheet.value = {
    isNew: true,
    leg: {
      id: uid(),
      kind: last ? (last.kind === 'stay' ? 'drive' : last.kind === 'drive' ? 'flight' : 'stay') : 'drive',
      title: '',
      from: last?.to ?? '',
      to: '',
      departAt: { local: startLocal, tz },
      arriveAt: { local: startLocal, tz },
      details: {},
      attachmentIds: [],
    },
  }
}
function editLeg(l: Leg) {
  legSheet.value = { leg: l, isNew: false }
}
function saveLeg(l: Leg) {
  if (!trip.value) return
  repo.commitTrip(trip.value.id, legSheet.value?.isNew ? tripOps.addLeg(l) : tripOps.updateLeg(l.id, l))
  legSheet.value = null
}
function deleteLeg() {
  if (!trip.value || !legSheet.value) return
  if (!confirm('Delete this leg?')) return
  repo.commitTrip(trip.value.id, tripOps.removeLeg(legSheet.value.leg.id))
  legSheet.value = null
}
function setReturnStart(l: Leg) {
  if (!trip.value) return
  repo.commitTrip(trip.value.id, tripOps.patch({ returnStartsAtLegId: trip.value.returnStartsAtLegId === l.id ? null : l.id }))
}
function legDate(l: Leg) {
  return hasTime(l.departAt) ? fmtDate(localTimeToDate(l.departAt), l.departAt.tz) : 'Date TBC'
}
function shiftedAfter(l: Leg): boolean {
  // whether the arrival is on a later local day than departure (overnight)
  if (!hasTime(l.departAt) || !hasTime(l.arriveAt)) return false
  return dateToLocalTime(localTimeToDate(l.arriveAt), l.arriveAt.tz).local.slice(0, 10) !== l.departAt.local.slice(0, 10)
}

// ── bags ───────────────────────────────────────────────────────────────────
const bagSheet = ref<{ bag: Bag; isNew: boolean } | null>(null)
function newBag(kind: Bag['kind']) {
  bagSheet.value = { isNew: true, bag: { id: uid(), name: kind === 'hold' ? 'Suitcase' : 'Cabin bag', ownerId: null, kind, maxKg: kind === 'hold' ? 23 : 10, measuredKg: null, measuredAt: null } }
}
function saveBag() {
  if (!trip.value || !bagSheet.value) return
  const b = { ...bagSheet.value.bag, measuredAt: bagSheet.value.bag.measuredKg != null ? nowIso() : null }
  repo.commitTrip(trip.value.id, bagSheet.value.isNew ? tripOps.addBag(b) : tripOps.updateBag(b.id, b))
  bagSheet.value = null
}
function deleteBag() {
  if (!trip.value || !bagSheet.value) return
  repo.commitTrip(trip.value.id, tripOps.removeBag(bagSheet.value.bag.id))
  bagSheet.value = null
}
function bagStatus(b: Bag): { text: string; cls: string } {
  if (b.measuredKg == null) return { text: b.maxKg != null ? `max ${b.maxKg} kg` : 'not weighed', cls: '' }
  if (b.maxKg != null && b.measuredKg > b.maxKg) return { text: `${b.measuredKg} kg — over by ${(b.measuredKg - b.maxKg).toFixed(1)}`, cls: 'danger' }
  return { text: `${b.measuredKg} kg${b.maxKg != null ? ` / ${b.maxKg}` : ''}`, cls: 'ok' }
}

// ── misc ───────────────────────────────────────────────────────────────────
function makeCurrent() {
  cfg.setCurrentTrip(isCurrent.value ? null : props.id)
}
async function remove() {
  if (!trip.value) return
  if (!confirm(`Delete "${trip.value.name}" and all its lists and files? This cannot be undone.`)) return
  try {
    await repo.deleteTrip(trip.value.id)
    router.replace({ name: 'trips' })
  } catch (e) {
    ui.toast(`Delete failed: ${e instanceof Error ? e.message : e}`, 'error')
  }
}
const taskForBooking = (bookingId: string) => trip.value?.tasks.find((t) => t.kind === 'booking' && t.fields.bookingId === bookingId)
</script>

<template>
  <div v-if="!trip" class="page empty">
    <p>Trip not found.</p>
    <router-link :to="{ name: 'trips' }">All trips</router-link>
  </div>
  <div v-else class="page">
    <div class="page-head">
      <div>
        <h1>{{ trip.name }}</h1>
        <div class="row wrap small" style="margin-top: 0.25rem">
          <span class="chip" :class="{ accent: state === 'current', ok: state === 'upcoming' }">{{ state }}</span>
          <span v-if="startDate" class="muted">from {{ fmtDate(new Date(startDate + 'T00:00:00'), homeTz, { year: 'numeric' }) }}</span>
          <span v-for="id in trip.typeIds" :key="id" class="chip outline">{{ repo.template(id)?.name ?? id }}</span>
        </div>
      </div>
      <button class="ghost" @click="openEdit">Edit</button>
    </div>

    <div class="row wrap" style="margin-bottom: 1rem">
      <router-link class="btn small" :to="{ name: 'tasks', params: { id: trip.id } }">Tasks</router-link>
      <router-link class="btn small" :to="{ name: 'packing', params: { id: trip.id } }">Packing</router-link>
      <button class="small" :class="{ primary: isCurrent }" @click="makeCurrent">{{ isCurrent ? '★ Current trip' : 'Make current' }}</button>
      <router-link class="btn small" :to="{ name: 'trip-new', query: { clone: trip.id } }">Clone</router-link>
    </div>

    <p v-if="trip.notes" style="white-space: pre-wrap">{{ trip.notes }}</p>

    <div v-if="todos.length" class="card">
      <h2>Trip setup <span class="chip warn">{{ todos.length }}</span></h2>
      <SetupTodoList :todos="todos" @pick="goTodo" />
    </div>

    <div class="card">
      <div class="row between">
        <h2>Itinerary</h2>
        <button class="small" :disabled="!repo.canEdit" @click="newLeg">+ Leg</button>
      </div>
      <p v-if="!legs.length" class="small muted">Add the legs of the journey: drive to the airport, flight, stay, flight home… The first leg sets the countdown.</p>
      <ul class="list">
        <li v-for="l in legs" :key="l.id" class="clickable" style="align-items: flex-start" @click="editLeg(l)">
          <div class="grow">
            <div class="row between">
              <b>{{ l.title || LEG_KIND_LABELS[l.kind] }}</b>
              <span v-if="retLeg?.id === l.id" class="chip accent">return starts</span>
            </div>
            <div class="small muted">{{ legDate(l) }}<template v-if="l.details.flightNumber"> · {{ l.details.flightNumber }}</template><template v-if="l.details.bookingRef"> · ref {{ l.details.bookingRef }}</template></div>
            <div class="small">
              <DualTime :value="l.departAt" :home-timezone="homeTz" />
              <span class="muted"> → </span>
              <DualTime :value="l.arriveAt" :home-timezone="homeTz" :with-date="shiftedAfter(l)" />
            </div>
            <div v-if="l.details.address" class="small muted">{{ l.details.address }}</div>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="showBags" class="card">
      <div class="row between">
        <h2>Bags</h2>
        <div class="row">
          <button class="small" :disabled="!repo.canEdit" @click="newBag('hold')">+ Hold</button>
          <button class="small" :disabled="!repo.canEdit" @click="newBag('cabin')">+ Cabin</button>
        </div>
      </div>
      <p v-if="!trip.bags.length" class="small muted">Add the bags you're taking with their weight allowances. Weigh-bag tasks pick from this list.</p>
      <ul class="list">
        <li v-for="b in trip.bags" :key="b.id" class="clickable" @click="bagSheet = { bag: { ...b }, isNew: false }">
          <div class="grow">
            <div>{{ b.name }} <span class="muted small">· {{ b.kind }} · {{ personName(b.ownerId) }}</span></div>
          </div>
          <span class="chip" :class="bagStatus(b).cls">{{ bagStatus(b).text }}</span>
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>Travellers</h2>
      <div class="row wrap">
        <router-link v-for="id in trip.travellers" :key="id" class="chip accent" :to="{ name: 'packing', params: { id: trip.id, personId: id } }">{{ personName(id) }}</router-link>
      </div>
    </div>

    <div v-if="trip.bookings.length" class="card">
      <h2>Bookings</h2>
      <ul class="list">
        <li v-for="b in trip.bookings" :key="b.id" style="align-items: flex-start">
          <div class="grow">
            <div><b>{{ BOOKING_KIND_LABELS[b.kind] }}</b> · {{ b.provider }}</div>
            <div class="small muted">
              <span v-if="b.reference">Ref {{ b.reference }}</span>
              <span v-if="b.cost != null"> · {{ b.currency }} {{ b.cost }}</span>
              <template v-for="(v, k) in b.fields" :key="k"><span v-if="v"> · {{ k }}: {{ v }}</span></template>
            </div>
            <router-link v-if="taskForBooking(b.id)" class="small" :to="{ name: 'task', params: { id: trip.id, taskId: taskForBooking(b.id)!.id } }">Open task</router-link>
          </div>
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>Files</h2>
      <AttachmentList :trip-id="trip.id" :attachment-ids="trip.attachments.map((a) => a.id)" :target="{}" />
    </div>

    <button class="danger block" style="margin-top: 1rem" :disabled="!repo.canEdit" @click="remove">Delete trip</button>

    <Sheet v-if="editing" title="Edit trip" @close="editing = false">
      <form class="stack" @submit.prevent="saveEdit">
        <label class="field"><span>Name</span><input v-model="draftName" type="text" required /></label>
        <label class="field"><span>Start date (used until the first leg has a time)</span><input v-model="draftStart" type="date" /></label>
        <div class="field">
          <span class="small muted">Who's going</span>
          <div style="margin-top: 0.3rem"><PersonChips v-model="draftTravellers" :people="people" /></div>
          <p class="small muted" style="margin-top: 0.3rem">Adding someone creates their packing list and per-person tasks.</p>
        </div>
        <label class="field"><span>Notes</span><textarea v-model="draftNotes" rows="3" /></label>
        <button type="submit" class="primary block">Save</button>
      </form>
    </Sheet>

    <Sheet v-if="legSheet" :title="legSheet.isNew ? 'Add leg' : 'Edit leg'" @close="legSheet = null">
      <LegForm :leg="legSheet.leg" :home-timezone="homeTz" :is-new="legSheet.isNew" @save="saveLeg" @delete="deleteLeg" @cancel="legSheet = null" />
      <div v-if="!legSheet.isNew" style="margin-top: 1rem">
        <label class="checkbox">
          <input type="checkbox" :checked="trip.returnStartsAtLegId === legSheet.leg.id" @change="setReturnStart(legSheet.leg)" />
          <span>The return journey starts with this leg</span>
        </label>
        <AttachmentList :trip-id="trip.id" :attachment-ids="legSheet.leg.attachmentIds" :target="{ legId: legSheet.leg.id }" compact />
      </div>
    </Sheet>

    <Sheet v-if="bagSheet" :title="bagSheet.isNew ? 'Add bag' : 'Edit bag'" @close="bagSheet = null">
      <form class="stack" @submit.prevent="saveBag">
        <label class="field"><span>Name</span><input v-model="bagSheet.bag.name" type="text" required /></label>
        <div class="grid-2">
          <label class="field">
            <span>Kind</span>
            <select v-model="bagSheet.bag.kind"><option value="hold">Hold</option><option value="cabin">Cabin</option></select>
          </label>
          <label class="field">
            <span>Owner</span>
            <select v-model="bagSheet.bag.ownerId">
              <option :value="null">Shared</option>
              <option v-for="id in trip.travellers" :key="id" :value="id">{{ personName(id) }}</option>
            </select>
          </label>
        </div>
        <div class="grid-2">
          <label class="field"><span>Max weight (kg)</span><input v-model.number="bagSheet.bag.maxKg" type="number" step="0.1" min="0" /></label>
          <label class="field"><span>Measured (kg)</span><input v-model.number="bagSheet.bag.measuredKg" type="number" step="0.1" min="0" /></label>
        </div>
        <div class="row">
          <button type="submit" class="primary grow">Save</button>
          <button v-if="!bagSheet.isNew" type="button" class="danger" @click="deleteBag">Delete</button>
        </div>
      </form>
    </Sheet>
  </div>
</template>
