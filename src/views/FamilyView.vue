<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { familyOps } from '@/lib/ops'
import { personId, uid } from '@/lib/ids'
import { deviceTimezone, COMMON_TIMEZONES, isValidTimezone } from '@/lib/time'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type Family, type Person, type PersonDocument, type DocumentType } from '@/lib/models'

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

// ── documents ──────────────────────────────────────────────────────────────
const docsOpen = ref<Record<string, boolean>>({})
function docStatus(d: PersonDocument): { text: string; cls: string } {
  if (!d.expires) return { text: 'no expiry', cls: 'warn' }
  const days = Math.round((new Date(d.expires + 'T23:59:59').getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: 'expired', cls: 'danger' }
  if (days < 183) return { text: `${days} days left`, cls: 'warn' }
  return { text: `expires ${d.expires}`, cls: 'ok' }
}
function setDocuments(p: Person, documents: PersonDocument[]) {
  updatePerson(p, { documents })
}
function addDocument(p: Person) {
  const have = new Set((p.documents ?? []).map((d) => d.type))
  const type: DocumentType = !have.has('passport') ? 'passport' : !have.has('ghic') ? 'ghic' : 'other'
  setDocuments(p, [...(p.documents ?? []), { id: uid(), type, label: '', number: '', expires: null }])
  docsOpen.value[p.id] = true
}
function updateDocument(p: Person, id: string, patch: Partial<PersonDocument>) {
  setDocuments(p, (p.documents ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)))
}
function removeDocument(p: Person, id: string) {
  setDocuments(p, (p.documents ?? []).filter((d) => d.id !== id))
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
      <p class="small muted">Passports, GHIC / EHIC cards and other documents live here with the person. Trips check them against the travel dates but never change them.</p>
      <ul class="list">
        <li v-for="p in draftPeople" :key="p.id" style="display: block">
          <div class="row" style="align-items: flex-start">
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
          </div>
          <div style="margin-top: 0.5rem">
            <button class="ghost small" @click="docsOpen[p.id] = !docsOpen[p.id]">
              {{ docsOpen[p.id] ? '▾' : '▸' }} Documents ({{ (p.documents ?? []).length }})
              <span v-for="d in p.documents ?? []" :key="d.id" class="chip" :class="docStatus(d).cls" style="margin-left: 0.3rem">{{ DOCUMENT_TYPE_LABELS[d.type].split(' ')[0] }}</span>
            </button>
            <div v-if="docsOpen[p.id]" class="stack" style="margin-top: 0.4rem; padding-left: 0.5rem; border-left: 2px solid var(--border)">
              <div v-for="d in p.documents ?? []" :key="d.id" class="stack" style="gap: 0.3rem">
                <div class="row">
                  <select :value="d.type" style="width: auto" @change="updateDocument(p, d.id, { type: ($event.target as HTMLSelectElement).value as DocumentType })">
                    <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">{{ DOCUMENT_TYPE_LABELS[t] }}</option>
                  </select>
                  <input class="grow" type="text" placeholder="Note (e.g. Irish passport)" :value="d.label" @change="updateDocument(p, d.id, { label: ($event.target as HTMLInputElement).value })" />
                  <button class="ghost small danger" aria-label="Remove document" @click="removeDocument(p, d.id)">✕</button>
                </div>
                <div class="row wrap">
                  <label class="field grow" style="margin: 0"><span>Expires</span><input type="date" :value="d.expires ?? ''" @change="updateDocument(p, d.id, { expires: ($event.target as HTMLInputElement).value || null })" /></label>
                  <label class="field grow" style="margin: 0"><span>Number (optional)</span><input type="text" autocapitalize="characters" :value="d.number" @change="updateDocument(p, d.id, { number: ($event.target as HTMLInputElement).value })" /></label>
                </div>
                <span class="chip" :class="docStatus(d).cls" style="align-self: flex-start">{{ docStatus(d).text }}</span>
              </div>
              <button class="small" style="align-self: flex-start" @click="addDocument(p)">+ Document</button>
            </div>
          </div>
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
