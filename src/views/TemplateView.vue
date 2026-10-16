<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { templateOps } from '@/lib/ops'
import { uid } from '@/lib/ids'
import { parsePackingText } from '@/lib/trip-factory'
import { hoursToOffsetLabel } from '@/lib/time'
import { TASK_KINDS, TASK_KIND_LABELS, PHASES, PHASE_LABELS, type TemplateTask, type Due, type PackingItemTemplate } from '@/lib/models'
import Sheet from '@/components/Sheet.vue'

const props = defineProps<{ id: string }>()
const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()

const tpl = computed(() => repo.template(props.id))
const adults = computed(() => (repo.family?.people ?? []).filter((p) => p.role === 'adult'))
const personName = (id: string) => repo.family?.people.find((p) => p.id === id)?.name ?? id

function rename(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && tpl.value) repo.commitTemplate(tpl.value.id, templateOps.patch({ name: v }))
}

// ── tasks ──────────────────────────────────────────────────────────────────
const editing = ref<TemplateTask | null>(null)
const dueAmount = ref(1)
const dueUnit = ref<'days' | 'hours'>('days')
const dueDir = ref<'before' | 'after'>('before')
const dueAnchor = ref<'departure' | 'return'>('departure')
const checklistText = ref('')

function openTask(t: TemplateTask | null) {
  const base: TemplateTask = t
    ? JSON.parse(JSON.stringify(t))
    : { id: uid(), kind: 'generic', title: '', notes: '', phase: 'before', due: { kind: 'relative', anchor: 'departure', offsetHours: -24 }, perTraveller: false, assigneeRole: 'anyone', checklist: [], fields: {} }
  editing.value = base
  if (base.due.kind === 'relative') {
    const h = Math.abs(base.due.offsetHours)
    dueUnit.value = h % 24 === 0 && h > 0 ? 'days' : 'hours'
    dueAmount.value = dueUnit.value === 'days' ? h / 24 : h
    dueDir.value = base.due.offsetHours > 0 ? 'after' : 'before'
    dueAnchor.value = typeof base.due.anchor === 'string' ? base.due.anchor : 'departure'
  }
  checklistText.value = base.checklist.join('\n')
}
function saveTask() {
  if (!tpl.value || !editing.value || !editing.value.title.trim()) return
  const hours = (dueUnit.value === 'days' ? dueAmount.value * 24 : dueAmount.value) * (dueDir.value === 'after' ? 1 : -1)
  const due: Due = { kind: 'relative', anchor: dueAnchor.value, offsetHours: hours }
  const t: TemplateTask = { ...editing.value, due, checklist: checklistText.value.split('\n').map((s) => s.trim()).filter(Boolean) }
  if (t.kind === 'pack') t.perTraveller = true
  repo.commitTemplate(tpl.value.id, templateOps.upsertTask(t))
  editing.value = null
}
function deleteTask() {
  if (!tpl.value || !editing.value) return
  repo.commitTemplate(tpl.value.id, templateOps.removeTask(editing.value.id))
  editing.value = null
}

// ── packing lists ──────────────────────────────────────────────────────────
type ListKey = 'child' | 'adultDefault' | { personId: string }
const listSheet = ref<{ key: ListKey; label: string; text: string } | null>(null)
function itemsText(items: PackingItemTemplate[]): string {
  return items.map((i) => (i.qty ? `${i.name} x${i.qty}` : i.name)).join('\n')
}
function openList(key: ListKey, label: string) {
  if (!tpl.value) return
  const items = typeof key === 'string' ? tpl.value.packing[key] : (tpl.value.packing.byPerson[key.personId] ?? tpl.value.packing.adultDefault)
  listSheet.value = { key, label, text: itemsText(items) }
}
function saveList() {
  if (!tpl.value || !listSheet.value) return
  repo.commitTemplate(tpl.value.id, templateOps.setPackingList(listSheet.value.key, parsePackingText(listSheet.value.text)))
  listSheet.value = null
}
function removePersonal(personId: string) {
  if (!tpl.value) return
  if (!confirm(`Remove ${personName(personId)}'s personal list? They will get the adult default again.`)) return
  const byPerson = { ...tpl.value.packing.byPerson }
  delete byPerson[personId]
  repo.commitTemplate(tpl.value.id, { apply: (t) => ({ ...t, packing: { ...t.packing, byPerson } }), describe: 'remove personal packing list' })
}

async function deleteTemplate() {
  if (!tpl.value) return
  if (!confirm(`Delete the "${tpl.value.name}" template?`)) return
  try {
    await repo.deleteTemplate(tpl.value.id)
    router.replace({ name: 'templates' })
  } catch (e) {
    ui.toast(`Delete failed: ${e instanceof Error ? e.message : e}`, 'error')
  }
}
</script>

<template>
  <div v-if="!tpl" class="page empty">Template not found.</div>
  <div v-else class="page">
    <div class="page-head">
      <router-link class="btn ghost" :to="{ name: 'templates' }">‹ Templates</router-link>
    </div>
    <label class="field"><span>Name</span><input type="text" :value="tpl.name" @change="rename" /></label>

    <div class="card">
      <div class="row between">
        <h2>Tasks</h2>
        <button class="small" :disabled="!repo.canEdit" @click="openTask(null)">+ Task</button>
      </div>
      <ul class="list">
        <li v-for="t in tpl.tasks" :key="t.id" class="clickable" @click="openTask(t)">
          <div class="grow">
            <div>{{ t.title }} <span v-if="t.perTraveller" class="chip">each traveller</span></div>
            <div class="small muted">
              {{ TASK_KIND_LABELS[t.kind] }} · {{ PHASE_LABELS[t.phase] }}
              <template v-if="t.due.kind === 'relative'"> · {{ hoursToOffsetLabel(t.due.offsetHours) }} {{ typeof t.due.anchor === 'string' ? t.due.anchor : 'a leg' }}</template>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>Packing lists</h2>
      <ul class="list">
        <li class="clickable" @click="openList('adultDefault', 'Adult default')">
          <div class="grow">Adult default <span class="small muted">· {{ tpl.packing.adultDefault.length }} items</span></div><span class="muted">›</span>
        </li>
        <li class="clickable" @click="openList('child', 'Child')">
          <div class="grow">Child <span class="small muted">· {{ tpl.packing.child.length }} items</span></div><span class="muted">›</span>
        </li>
        <li v-for="p in adults" :key="p.id" class="clickable" @click="openList({ personId: p.id }, `${p.name}'s list`)">
          <div class="grow">
            {{ p.name }}
            <span class="small muted">· {{ tpl.packing.byPerson[p.id] ? `${tpl.packing.byPerson[p.id]!.length} items (personal)` : 'uses adult default' }}</span>
          </div>
          <button v-if="tpl.packing.byPerson[p.id]" class="ghost small danger" @click.stop="removePersonal(p.id)">✕</button>
          <span class="muted">›</span>
        </li>
      </ul>
    </div>

    <button class="danger" :disabled="!repo.canEdit" @click="deleteTemplate">Delete template</button>

    <Sheet v-if="editing" :title="tpl.tasks.some((t) => t.id === editing!.id) ? 'Edit template task' : 'New template task'" @close="editing = null">
      <form class="stack" @submit.prevent="saveTask">
        <label class="field"><span>Title</span><input v-model="editing.title" type="text" required /></label>
        <div class="grid-2">
          <label class="field">
            <span>Kind</span>
            <select v-model="editing.kind"><option v-for="k in TASK_KINDS" :key="k" :value="k">{{ TASK_KIND_LABELS[k] }}</option></select>
          </label>
          <label class="field">
            <span>Phase</span>
            <select v-model="editing.phase"><option v-for="p in PHASES" :key="p" :value="p">{{ PHASE_LABELS[p] }}</option></select>
          </label>
        </div>
        <div class="field">
          <span class="small muted">Due</span>
          <div class="row wrap" style="margin-top: 0.3rem">
            <input v-model.number="dueAmount" type="number" min="0" style="width: 80px" />
            <select v-model="dueUnit" style="width: auto"><option value="days">days</option><option value="hours">hours</option></select>
            <select v-model="dueDir" style="width: auto"><option value="before">before</option><option value="after">after</option></select>
            <select v-model="dueAnchor" style="width: auto"><option value="departure">departure</option><option value="return">return</option></select>
          </div>
        </div>
        <label class="checkbox"><input v-model="editing.perTraveller" type="checkbox" /> <span>One task per traveller</span></label>
        <label class="checkbox"><input type="checkbox" :checked="editing.assigneeRole === 'adult'" @change="editing!.assigneeRole = ($event.target as HTMLInputElement).checked ? 'adult' : 'anyone'" /> <span>Adults only</span></label>
        <label class="field"><span>Checklist (one per line)</span><textarea v-model="checklistText" rows="3" /></label>
        <label class="field"><span>Notes</span><textarea v-model="editing.notes" rows="2" /></label>
        <div class="row">
          <button type="submit" class="primary grow">Save</button>
          <button v-if="tpl.tasks.some((t) => t.id === editing!.id)" type="button" class="danger" @click="deleteTask">Delete</button>
        </div>
      </form>
    </Sheet>

    <Sheet v-if="listSheet" :title="listSheet.label" @close="listSheet = null">
      <p class="small muted">One item per line; "x2" sets a quantity.</p>
      <textarea v-model="listSheet.text" rows="14" />
      <button class="primary block" style="margin-top: 0.6rem" :disabled="!repo.canEdit" @click="saveList">Save list</button>
    </Sheet>
  </div>
</template>
