<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { familyOps } from '@/lib/ops'
import { personId } from '@/lib/ids'
import { deviceTimezone, COMMON_TIMEZONES, isValidTimezone } from '@/lib/time'
import type { Family, Person } from '@/lib/models'

const repo = useRepoStore()
const cfg = useConfigStore()
const ui = useUiStore()
const router = useRouter()

const firstRun = computed(() => !repo.family)

// Local draft for the first-run wizard; edits on an existing family commit directly.
const name = ref(repo.family?.name ?? '')
const homeTimezone = ref(repo.family?.homeTimezone ?? deviceTimezone())
const draftPeople = ref<Person[]>(repo.family?.people.map((p) => ({ ...p })) ?? [])

const newName = ref('')
const newRole = ref<'adult' | 'child'>('adult')
const busy = ref(false)

const zones = computed(() => {
  const z = new Set([homeTimezone.value, deviceTimezone(), ...COMMON_TIMEZONES])
  return [...z].filter(isValidTimezone)
})

function addPerson() {
  const n = newName.value.trim()
  if (!n) return
  const p: Person = {
    id: personId(n, draftPeople.value.map((x) => x.id)),
    name: n,
    role: newRole.value,
    managedBy: newRole.value === 'child' ? 'parent' : 'self',
  }
  if (firstRun.value) draftPeople.value.push(p)
  else {
    repo.commitFamily(familyOps.upsertPerson(p))
    draftPeople.value.push(p)
  }
  newName.value = ''
}

function updatePerson(p: Person, patch: Partial<Person>) {
  const next = { ...p, ...patch }
  if (patch.role === 'child') next.managedBy = 'parent'
  Object.assign(p, next)
  if (!firstRun.value) repo.commitFamily(familyOps.upsertPerson({ ...next }))
}

function removePerson(p: Person) {
  if (!confirm(`Remove ${p.name} from the family?`)) return
  draftPeople.value = draftPeople.value.filter((x) => x.id !== p.id)
  if (!firstRun.value) repo.commitFamily(familyOps.removePerson(p.id))
  if (cfg.config.meId === p.id) cfg.setMe(null)
}

function saveDetails() {
  if (firstRun.value) return
  repo.commitFamily(familyOps.patch({ name: name.value.trim(), homeTimezone: homeTimezone.value }))
  ui.toast('Saved', 'success')
}

async function finishSetup() {
  if (!draftPeople.value.length) {
    ui.toast('Add at least one person', 'error')
    return
  }
  busy.value = true
  try {
    const fam: Family = { version: 1, name: name.value.trim() || 'Our family', homeTimezone: homeTimezone.value, people: draftPeople.value }
    await repo.scaffold(fam)
    ui.toast('Family set up', 'success')
    router.replace({ name: 'who' })
  } catch (e) {
    ui.toast(`Could not write to the data repo: ${e instanceof Error ? e.message : e}`, 'error', 6000)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ firstRun ? 'Set up your family' : 'Family' }}</h1>
      <router-link v-if="!firstRun" class="btn ghost" :to="{ name: 'settings' }">Back</router-link>
    </div>
    <p v-if="firstRun" class="muted">This is written to your data repo once, along with starter trip templates.</p>

    <div class="card">
      <label class="field">
        <span>Family name</span>
        <input v-model="name" type="text" placeholder="The Smiths" @change="saveDetails" />
      </label>
      <label class="field">
        <span>Home time zone</span>
        <select v-model="homeTimezone" @change="saveDetails">
          <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
        </select>
      </label>
    </div>

    <div class="card">
      <h2>People</h2>
      <ul class="list">
        <li v-for="p in draftPeople" :key="p.id">
          <div class="grow">
            <input type="text" :value="p.name" @change="updatePerson(p, { name: ($event.target as HTMLInputElement).value })" />
            <div class="row wrap" style="margin-top: 0.4rem">
              <select :value="p.role" style="width: auto" @change="updatePerson(p, { role: ($event.target as HTMLSelectElement).value as Person['role'] })">
                <option value="adult">Adult</option>
                <option value="child">Child</option>
              </select>
              <select :value="p.managedBy" style="width: auto" @change="updatePerson(p, { managedBy: ($event.target as HTMLSelectElement).value as Person['managedBy'] })">
                <option value="self">Manages own tasks</option>
                <option value="parent">A parent manages tasks</option>
              </select>
            </div>
          </div>
          <button class="ghost danger" aria-label="Remove" @click="removePerson(p)">✕</button>
        </li>
      </ul>
      <form class="row" style="margin-top: 0.75rem" @submit.prevent="addPerson">
        <input v-model="newName" class="grow" type="text" placeholder="Name" />
        <select v-model="newRole" style="width: auto">
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </select>
        <button type="submit">Add</button>
      </form>
    </div>

    <button v-if="firstRun" class="primary block" :disabled="busy || !draftPeople.length" @click="finishSetup">
      {{ busy ? 'Writing to repo…' : 'Finish setup' }}
    </button>
  </div>
</template>
