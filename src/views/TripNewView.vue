<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { createTripFromTemplates, cloneTrip } from '@/lib/trip-factory'
import { departureDate, fmtDate } from '@/lib/time'
import PersonChips from '@/components/PersonChips.vue'

const repo = useRepoStore()
const cfg = useConfigStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

const mode = ref<'template' | 'clone'>(typeof route.query.clone === 'string' ? 'clone' : 'template')
const name = ref('')
const startDate = ref(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
const typeIds = ref<string[]>([])
const travellers = ref<string[]>(repo.family?.people.map((p) => p.id) ?? [])
const sourceId = ref<string>(typeof route.query.clone === 'string' ? route.query.clone : '')
const notes = ref('')
const busy = ref(false)

const people = computed(() => repo.family?.people ?? [])
const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')
const sources = computed(() =>
  [...repo.trips].sort((a, b) => (departureDate(b)?.getTime() ?? 0) - (departureDate(a)?.getTime() ?? 0)),
)

function toggleType(id: string) {
  typeIds.value = typeIds.value.includes(id) ? typeIds.value.filter((x) => x !== id) : [...typeIds.value, id]
}

const valid = computed(() => {
  if (!name.value.trim() || !startDate.value || !travellers.value.length) return false
  return mode.value === 'template' ? typeIds.value.length > 0 : !!sourceId.value
})

async function create() {
  if (!valid.value || !repo.family) return
  busy.value = true
  try {
    const existing = repo.trips.map((t) => t.id)
    let result
    if (mode.value === 'template') {
      const templates = typeIds.value.map((id) => repo.template(id)).filter((t): t is NonNullable<typeof t> => !!t)
      result = createTripFromTemplates({ name: name.value, typeIds: typeIds.value, travellers: travellers.value, notes: notes.value, startDate: startDate.value }, templates, repo.family, existing)
    } else {
      const src = repo.trip(sourceId.value)
      if (!src) throw new Error('Source trip not found')
      result = cloneTrip(src, repo.packingLists(src.id), { name: name.value, startDate: startDate.value, travellers: travellers.value }, repo.family, existing)
      if (notes.value.trim()) result.trip.notes = notes.value
    }
    await repo.createTrip(result.trip, result.packing)
    cfg.setCurrentTrip(result.trip.id)
    ui.toast('Trip created', 'success')
    router.replace({ name: 'trip', params: { id: result.trip.id } })
  } catch (e) {
    ui.toast(`Could not create trip: ${e instanceof Error ? e.message : e}`, 'error', 6000)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>New trip</h1>
      <router-link class="btn ghost" :to="{ name: 'trips' }">Cancel</router-link>
    </div>

    <div class="segmented" style="margin-bottom: 1rem">
      <button :class="{ on: mode === 'template' }" @click="mode = 'template'">From templates</button>
      <button :class="{ on: mode === 'clone' }" :disabled="!sources.length" @click="mode = 'clone'">Clone a past trip</button>
    </div>

    <form class="card" @submit.prevent="create">
      <label class="field">
        <span>Trip name</span>
        <input v-model="name" type="text" required placeholder="Tignes ski week" />
      </label>
      <label class="field">
        <span>Start date (you'll add the legs next)</span>
        <input v-model="startDate" type="date" required />
      </label>

      <div v-if="mode === 'template'" class="field">
        <span class="small muted">Trip types (pick one or more; tasks and packing lists are merged)</span>
        <div class="row wrap" style="margin-top: 0.3rem">
          <button v-for="t in repo.templates" :key="t.id" type="button" class="chip selectable" :class="{ on: typeIds.includes(t.id) }" @click="toggleType(t.id)">
            {{ t.name }}
          </button>
        </div>
      </div>

      <label v-else class="field">
        <span>Copy legs, bags, tasks and packing lists from</span>
        <select v-model="sourceId" required>
          <option value="" disabled>Choose a trip</option>
          <option v-for="t in sources" :key="t.id" :value="t.id">
            {{ t.name }}<template v-if="departureDate(t)"> · {{ fmtDate(departureDate(t)!, homeTz, { year: 'numeric' }) }}</template>
          </option>
        </select>
      </label>

      <div class="field">
        <span class="small muted">Who's going</span>
        <div style="margin-top: 0.3rem"><PersonChips v-model="travellers" :people="people" /></div>
      </div>

      <label class="field">
        <span>Notes</span>
        <textarea v-model="notes" rows="2" />
      </label>

      <button type="submit" class="primary block" :disabled="!valid || busy || !repo.canEdit">{{ busy ? 'Creating…' : 'Create trip' }}</button>
    </form>
  </div>
</template>
