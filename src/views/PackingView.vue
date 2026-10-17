<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { packingOps, newPackingItem, templateOps } from '@/lib/ops'
import { parsePackingText, packingForNewTraveller } from '@/lib/trip-factory'
import { packingCompletion } from '@/lib/progress'
import type { PackingItem, TripTemplate, Person } from '@/lib/models'
import Sheet from '@/components/Sheet.vue'
import Progress from '@/components/Progress.vue'
import CheckBox from '@/components/CheckBox.vue'

const props = defineProps<{ id: string; personId?: string }>()
const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()

const trip = computed(() => repo.trip(props.id))
const people = computed(() => repo.family?.people ?? [])
const travellers = computed(() => people.value.filter((p) => trip.value?.travellers.includes(p.id)))
const me = computed(() => repo.me())

const person = computed<Person | null>(() => {
  const id = props.personId ?? (travellers.value.some((p) => p.id === me.value?.id) ? me.value!.id : travellers.value[0]?.id)
  return people.value.find((p) => p.id === id) ?? null
})
watch(
  () => [props.personId, person.value?.id],
  () => {
    if (!props.personId && person.value && trip.value) router.replace({ name: 'packing', params: { id: trip.value.id, personId: person.value.id } })
  },
  { immediate: true },
)

const list = computed(() => (trip.value && person.value ? repo.packing(trip.value.id, person.value.id) : null))
const progress = computed(() => packingCompletion(list.value))
const filter = ref<'all' | 'todo' | 'buy'>('all')
const items = computed<PackingItem[]>(() => {
  const all = list.value?.items ?? []
  if (filter.value === 'todo') return all.filter((i) => !i.packed)
  if (filter.value === 'buy') return all.filter((i) => i.needToBuy && !i.bought)
  return all
})
const toBuy = computed(() => (list.value?.items ?? []).filter((i) => i.needToBuy && !i.bought).length)

const commit = (op: ReturnType<typeof packingOps.update>) => trip.value && person.value && repo.commitPacking(trip.value.id, person.value.id, op)

const newName = ref('')
function add() {
  const n = newName.value.trim()
  if (!n) return
  const parsed = parsePackingText(n)[0] ?? { name: n }
  commit(packingOps.add([newPackingItem(parsed.name, parsed.qty ?? null)]))
  newName.value = ''
}
function togglePacked(i: PackingItem) {
  commit(packingOps.update(i.id, { packed: !i.packed }))
}
function toggleBuy(i: PackingItem) {
  if (i.needToBuy && !i.bought) commit(packingOps.update(i.id, { bought: true }))
  else if (i.needToBuy && i.bought) commit(packingOps.update(i.id, { needToBuy: false, bought: false }))
  else commit(packingOps.update(i.id, { needToBuy: true, bought: false }))
}
function remove(i: PackingItem) {
  commit(packingOps.remove(i.id))
}
function rename(i: PackingItem, e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== i.name) commit(packingOps.update(i.id, { name: v }))
}
function resetAll() {
  if (!confirm('Mark everything as not packed?')) return
  commit(packingOps.resetPacked())
}

async function createList() {
  if (!trip.value || !person.value) return
  try {
    await repo.createPackingList(trip.value.id, packingForNewTraveller(trip.value, repo.templates, person.value))
  } catch (e) {
    ui.toast(`Could not create list: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

// ── import ─────────────────────────────────────────────────────────────────
const importing = ref(false)
const importText = ref('')
function doImport() {
  const parsed = parsePackingText(importText.value)
  if (!parsed.length) return
  const existing = new Set((list.value?.items ?? []).map((i) => i.name.toLowerCase()))
  const fresh = parsed.filter((p) => !existing.has(p.name.toLowerCase()))
  commit(packingOps.add(fresh.map((p) => newPackingItem(p.name, p.qty ?? null))))
  ui.toast(`Added ${fresh.length} item${fresh.length === 1 ? '' : 's'}${parsed.length - fresh.length ? ` (${parsed.length - fresh.length} already there)` : ''}`, 'success')
  importText.value = ''
  importing.value = false
}

// ── save to template ───────────────────────────────────────────────────────
const tplSheet = ref(false)
const tripTemplates = computed(() => (trip.value ? trip.value.typeIds.map((id) => repo.template(id)).filter((t): t is TripTemplate => !!t) : []))
function saveToTemplate() {
  if (tripTemplates.value.length === 1) saveToExisting(tripTemplates.value[0]!)
  else tplSheet.value = true
}
function saveToExisting(tpl: TripTemplate) {
  if (!list.value || !person.value) return
  const items = list.value.items.map((i) => ({ name: i.name, ...(i.qty != null ? { qty: i.qty } : {}) }))
  if (person.value.role === 'child') {
    repo.commitTemplate(tpl.id, templateOps.addPackingItems('child', items))
  } else {
    // Adults get a personal list; seed it from the default the first time so nothing is lost.
    const hasPersonal = !!tpl.packing.byPerson[person.value.id]
    if (!hasPersonal) repo.commitTemplate(tpl.id, templateOps.setPackingList({ personId: person.value.id }, [...tpl.packing.adultDefault]))
    repo.commitTemplate(tpl.id, templateOps.addPackingItems({ personId: person.value.id }, items))
  }
  ui.toast(`Saved ${person.value.name}'s list to ${tpl.name}`, 'success')
  tplSheet.value = false
}
</script>

<template>
  <div v-if="!trip" class="page empty">Trip not found.</div>
  <div v-else class="page">
    <div class="page-head">
      <div>
        <h1>Packing</h1>
        <router-link class="small" :to="{ name: 'trip', params: { id: trip.id } }">{{ trip.name }}</router-link>
      </div>
      <div class="row">
        <button class="small" :disabled="!list || !repo.canEdit" @click="importing = true">Import</button>
        <button class="small" :disabled="!list || !repo.canEdit" @click="saveToTemplate">Save to template</button>
      </div>
    </div>

    <div class="segmented" style="margin-bottom: 0.75rem">
      <router-link v-for="p in travellers" :key="p.id" custom :to="{ name: 'packing', params: { id: trip.id, personId: p.id } }" v-slot="{ navigate }">
        <button :class="{ on: person?.id === p.id }" @click="navigate">{{ p.name }}</button>
      </router-link>
    </div>

    <div v-if="!person" class="empty">No travellers on this trip yet.</div>
    <div v-else-if="!list" class="empty">
      <p>{{ person.name }} has no packing list for this trip yet.</p>
      <button class="primary" :disabled="!repo.canEdit" @click="createList">Create from template</button>
    </div>
    <template v-else>
      <div class="card">
        <Progress :done="progress.done" :total="progress.total" />
        <div class="segmented" style="margin-top: 0.6rem">
          <button :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
          <button :class="{ on: filter === 'todo' }" @click="filter = 'todo'">To pack</button>
          <button :class="{ on: filter === 'buy' }" @click="filter = 'buy'">To buy{{ toBuy ? ` (${toBuy})` : '' }}</button>
        </div>
      </div>

      <div class="card">
        <ul class="list">
          <li v-for="i in items" :key="i.id">
            <CheckBox :checked="i.packed" :disabled="!repo.canEdit" label="Packed" @toggle="togglePacked(i)" />
            <div class="grow">
              <input type="text" :value="i.name" :class="{ done: i.packed }" style="border: none; background: transparent; padding: 0.2rem 0; min-height: 0" @change="rename(i, $event)" />
              <div v-if="i.qty || i.needToBuy" class="small muted">
                <span v-if="i.qty">× {{ i.qty }}</span>
                <span v-if="i.needToBuy && !i.bought" class="chip warn">to buy</span>
                <span v-else-if="i.needToBuy && i.bought" class="chip ok">bought</span>
              </div>
            </div>
            <button class="ghost small" :title="i.needToBuy ? (i.bought ? 'Clear shopping flag' : 'Mark bought') : 'Need to buy'" :disabled="!repo.canEdit" @click="toggleBuy(i)">
              {{ i.needToBuy ? (i.bought ? '✓🛒' : '🛒') : '🛒' }}
            </button>
            <button class="ghost small danger" aria-label="Remove" :disabled="!repo.canEdit" @click="remove(i)">✕</button>
          </li>
        </ul>
        <p v-if="!items.length" class="small muted">Nothing to show.</p>
        <form class="row" style="margin-top: 0.5rem" @submit.prevent="add">
          <input v-model="newName" class="grow" type="text" placeholder="Add an item (e.g. 'Socks x4')" :disabled="!repo.canEdit" />
          <button type="submit" :disabled="!newName.trim() || !repo.canEdit">Add</button>
        </form>
      </div>

      <button class="small ghost" :disabled="!repo.canEdit" @click="resetAll">Reset all to not packed</button>
    </template>

    <Sheet v-if="importing" title="Import a list" @close="importing = false">
      <p class="small muted">One item per line. Bullets and "x2" quantities are understood. Items already on the list are skipped.</p>
      <textarea v-model="importText" rows="10" placeholder="Ski socks x4&#10;Goggles&#10;Sun cream" />
      <button class="primary block" style="margin-top: 0.6rem" :disabled="!importText.trim()" @click="doImport">Add items</button>
    </Sheet>

    <Sheet v-if="tplSheet" title="Save to which template?" @close="tplSheet = false">
      <div class="stack">
        <button v-for="t in tripTemplates" :key="t.id" class="block" @click="saveToExisting(t)">{{ t.name }}</button>
      </div>
    </Sheet>
  </div>
</template>
