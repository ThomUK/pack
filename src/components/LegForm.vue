<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import type { Leg, LegKind } from '@/lib/models'
import { LEG_KINDS, LEG_KIND_LABELS } from '@/lib/models'
import LocalTimeInput from './LocalTimeInput.vue'

const props = defineProps<{ leg: Leg; homeTimezone: string; isNew: boolean }>()
const emit = defineEmits<{ save: [Leg]; delete: []; cancel: [] }>()

const draft = reactive<Leg>(JSON.parse(JSON.stringify(props.leg)))

const isTravel = computed(() => ['drive', 'flight', 'train', 'ferry', 'other'].includes(draft.kind))
const fromLabel = computed(() => (draft.kind === 'stay' ? 'Place' : draft.kind === 'wait' ? 'Where' : 'From'))
const departLabel = computed(() => (draft.kind === 'stay' ? 'Check-in' : draft.kind === 'wait' ? 'From' : 'Departs'))
const arriveLabel = computed(() => (draft.kind === 'stay' ? 'Check-out' : draft.kind === 'wait' ? 'Until' : 'Arrives'))

// Keep arrival zone in step with departure zone for same-zone legs until the user changes it.
let arriveTouched = draft.arriveAt.tz !== draft.departAt.tz
watch(
  () => draft.departAt.tz,
  (tz) => {
    if (!arriveTouched) draft.arriveAt.tz = tz
  },
)
watch(
  () => draft.arriveAt.tz,
  (tz) => {
    if (tz !== draft.departAt.tz) arriveTouched = true
  },
)
// Arrival defaults to departure when empty or earlier.
watch(
  () => draft.departAt.local,
  (v) => {
    if (!draft.arriveAt.local || draft.arriveAt.local < v) draft.arriveAt.local = v
  },
)

function autoTitle() {
  if (draft.title.trim()) return
  const k = LEG_KIND_LABELS[draft.kind]
  if (draft.kind === 'stay') draft.title = draft.from ? `Stay at ${draft.from}` : 'Stay'
  else if (draft.kind === 'wait') draft.title = draft.from ? `Wait at ${draft.from}` : 'Wait'
  else draft.title = draft.from && draft.to ? `${k} ${draft.from} → ${draft.to}` : k
}

function submit() {
  autoTitle()
  // Times may be left blank; the trip's setup list will nag until they are filled in.
  emit('save', JSON.parse(JSON.stringify(draft)))
}
</script>

<template>
  <form class="stack" @submit.prevent="submit">
    <label class="field">
      <span>Kind</span>
      <select v-model="draft.kind">
        <option v-for="k in LEG_KINDS" :key="k" :value="k as LegKind">{{ LEG_KIND_LABELS[k] }}</option>
      </select>
    </label>
    <div class="grid-2">
      <label class="field">
        <span>{{ fromLabel }}</span>
        <input v-model="draft.from" type="text" :placeholder="draft.kind === 'flight' ? 'MAN' : ''" />
      </label>
      <label v-if="isTravel" class="field">
        <span>To</span>
        <input v-model="draft.to" type="text" :placeholder="draft.kind === 'flight' ? 'GVA' : ''" />
      </label>
    </div>
    <LocalTimeInput v-model="draft.departAt" :label="departLabel" :home-timezone="homeTimezone" />
    <LocalTimeInput v-model="draft.arriveAt" :label="arriveLabel" :home-timezone="homeTimezone" />
    <p class="small muted" style="margin-top: -0.5rem">Not booked yet? Leave the times blank and the trip setup list will remind you.</p>

    <template v-if="draft.kind === 'flight'">
      <div class="grid-2">
        <label class="field"><span>Flight number</span><input v-model="draft.details.flightNumber" type="text" placeholder="EZY1234" /></label>
        <label class="field"><span>Airline</span><input v-model="draft.details.carrier" type="text" /></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Booking reference</span><input v-model="draft.details.bookingRef" type="text" /></label>
        <label class="field"><span>Terminal</span><input v-model="draft.details.terminal" type="text" /></label>
      </div>
    </template>
    <template v-else-if="draft.kind === 'train' || draft.kind === 'ferry'">
      <div class="grid-2">
        <label class="field"><span>Operator</span><input v-model="draft.details.carrier" type="text" /></label>
        <label class="field"><span>Booking reference</span><input v-model="draft.details.bookingRef" type="text" /></label>
      </div>
    </template>
    <template v-else-if="draft.kind === 'stay'">
      <label class="field"><span>Address</span><textarea v-model="draft.details.address" rows="2" /></label>
      <div class="grid-2">
        <label class="field"><span>Phone</span><input v-model="draft.details.phone" type="text" /></label>
        <label class="field"><span>Booking reference</span><input v-model="draft.details.bookingRef" type="text" /></label>
      </div>
    </template>

    <label class="field">
      <span>Title (optional)</span>
      <input v-model="draft.title" type="text" placeholder="Auto from the details above" />
    </label>
    <label class="field">
      <span>Notes</span>
      <textarea v-model="draft.details.notes" rows="2" />
    </label>

    <div class="row">
      <button type="submit" class="primary grow">{{ isNew ? 'Add leg' : 'Save' }}</button>
      <button v-if="!isNew" type="button" class="danger" @click="emit('delete')">Delete</button>
    </div>
  </form>
</template>
