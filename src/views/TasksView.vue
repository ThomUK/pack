<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { tripOps } from '@/lib/ops'
import { uid, nowIso } from '@/lib/ids'
import { tasksWithDue, sortByDue, isMine, type TaskWithDue } from '@/lib/progress'
import { TASK_KINDS, TASK_KIND_LABELS, PHASES, PHASE_LABELS, type Task, type TaskKind, type Phase, type Due } from '@/lib/models'
import TaskRow from '@/components/TaskRow.vue'
import Sheet from '@/components/Sheet.vue'
import DueEditor from '@/components/DueEditor.vue'

const props = defineProps<{ id: string }>()
const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()

const trip = computed(() => repo.trip(props.id))
const people = computed(() => repo.family?.people ?? [])
const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')
const me = computed(() => repo.me())

const scope = ref<'mine' | 'all'>(me.value ? 'mine' : 'all')
const phase = ref<Phase | 'all'>('before')
const showDone = ref(false)
const personFilter = ref<string>('')

const visible = computed<TaskWithDue[]>(() => {
  if (!trip.value) return []
  let list = tasksWithDue(trip.value, ui.now)
  if (phase.value !== 'all') list = list.filter((x) => x.task.phase === phase.value)
  if (scope.value === 'mine' && me.value) list = list.filter((x) => isMine(x.task, me.value!, people.value))
  if (personFilter.value) list = list.filter((x) => x.task.assigneeId === personFilter.value)
  if (!showDone.value) list = list.filter((x) => x.task.status !== 'done')
  return sortByDue(list)
})

const groups = computed(() => {
  const g: Record<string, TaskWithDue[]> = { overdue: [], today: [], soon: [], later: [], none: [], done: [] }
  for (const x of visible.value) {
    if (x.task.status === 'done') g.done!.push(x)
    else g[x.state]!.push(x)
  }
  const labels: Record<string, string> = { overdue: 'Overdue', today: 'Due in the next 24 hours', soon: 'Due soon', later: 'Later', none: 'No due date', done: 'Done' }
  return Object.entries(g)
    .filter(([, v]) => v.length)
    .map(([k, v]) => ({ key: k, label: labels[k]!, items: v }))
})

const doneCount = computed(() => trip.value?.tasks.filter((t) => t.status === 'done').length ?? 0)

function toggle(task: Task) {
  if (!trip.value || !me.value) return
  repo.commitTrip(trip.value.id, tripOps.setTaskStatus(task.id, task.status !== 'done', me.value.id))
}
function open(task: Task) {
  router.push({ name: 'task', params: { id: props.id, taskId: task.id } })
}

// ── new task ───────────────────────────────────────────────────────────────
const adding = ref(false)
const nTitle = ref('')
const nKind = ref<TaskKind>('generic')
const nAssignee = ref<string | null>(null)
const nPhase = ref<Phase>('before')
const nDue = ref<Due>({ kind: 'relative', anchor: 'departure', offsetHours: -24 })

function openAdd() {
  nTitle.value = ''
  nKind.value = 'generic'
  nAssignee.value = me.value?.id ?? null
  nPhase.value = phase.value === 'all' ? 'before' : phase.value
  nDue.value = { kind: 'relative', anchor: 'departure', offsetHours: -24 }
  adding.value = true
}
function addTask() {
  const t = trip.value
  if (!t || !nTitle.value.trim()) return
  const fields: Record<string, unknown> =
    nKind.value === 'checkin'
      ? { legId: null, opens: { kind: 'relative', hoursBefore: 24 }, passesInAirlineApp: false, boardingPasses: {} }
      : nKind.value === 'weighBag'
        ? { bagId: null }
        : nKind.value === 'pack'
          ? { personId: nAssignee.value ?? '' }
          : nKind.value === 'documents'
            ? { checks: t.travellers.map((personId) => ({ personId, docType: 'Passport', expires: null, checked: false })) }
            : nKind.value === 'booking'
              ? { bookingKind: 'other' }
              : {}
  const task: Task = {
    id: uid(),
    kind: nKind.value,
    title: nTitle.value.trim(),
    notes: '',
    assigneeId: nAssignee.value,
    phase: nPhase.value,
    due: nDue.value,
    status: 'todo',
    completedBy: null,
    completedAt: null,
    checklist: [],
    fields,
    attachmentIds: [],
    templateId: null,
    updatedAt: nowIso(),
  }
  repo.commitTrip(t.id, tripOps.addTask(task))
  adding.value = false
  if (nKind.value !== 'generic') router.push({ name: 'task', params: { id: t.id, taskId: task.id } })
}
</script>

<template>
  <div v-if="!trip" class="page empty">Trip not found.</div>
  <div v-else class="page">
    <div class="page-head">
      <div>
        <h1>Tasks</h1>
        <router-link class="small" :to="{ name: 'trip', params: { id: trip.id } }">{{ trip.name }}</router-link>
      </div>
      <button class="primary" :disabled="!repo.canEdit" @click="openAdd">+ Task</button>
    </div>

    <div class="stack" style="margin-bottom: 1rem">
      <div class="segmented">
        <button :class="{ on: scope === 'mine' }" :disabled="!me" @click="scope = 'mine'">Mine</button>
        <button :class="{ on: scope === 'all' }" @click="scope = 'all'">Everyone</button>
      </div>
      <div class="segmented">
        <button v-for="p in PHASES" :key="p" :class="{ on: phase === p }" @click="phase = p">{{ PHASE_LABELS[p].replace(' departure', '').replace('the ', '') }}</button>
        <button :class="{ on: phase === 'all' }" @click="phase = 'all'">All</button>
      </div>
      <div class="row wrap small">
        <select v-model="personFilter" style="width: auto" class="small">
          <option value="">Any person</option>
          <option v-for="id in trip.travellers" :key="id" :value="id">{{ people.find((p) => p.id === id)?.name ?? id }}</option>
        </select>
        <label class="checkbox"><input v-model="showDone" type="checkbox" /> <span>Show done ({{ doneCount }})</span></label>
      </div>
    </div>

    <div v-if="!visible.length" class="empty">Nothing here. 🎉</div>
    <div v-for="g in groups" :key="g.key" class="card">
      <h3 :class="{ overdue: g.key === 'overdue', 'due-today': g.key === 'today' }">{{ g.label }}</h3>
      <ul class="list">
        <TaskRow v-for="x in g.items" :key="x.task.id" :task="x.task" :trip="trip" :people="people" :home-timezone="homeTz" :show-assignee="scope === 'all' || x.task.assigneeId !== me?.id" @toggle="toggle" @open="open" />
      </ul>
    </div>

    <Sheet v-if="adding" title="New task" @close="adding = false">
      <form class="stack" @submit.prevent="addTask">
        <label class="field"><span>Title</span><input v-model="nTitle" type="text" required autofocus /></label>
        <div class="grid-2">
          <label class="field">
            <span>Kind</span>
            <select v-model="nKind"><option v-for="k in TASK_KINDS" :key="k" :value="k">{{ TASK_KIND_LABELS[k] }}</option></select>
          </label>
          <label class="field">
            <span>Assigned to</span>
            <select v-model="nAssignee">
              <option :value="null">Anyone</option>
              <option v-for="id in trip.travellers" :key="id" :value="id">{{ people.find((p) => p.id === id)?.name ?? id }}</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Phase</span>
          <select v-model="nPhase"><option v-for="p in PHASES" :key="p" :value="p">{{ PHASE_LABELS[p] }}</option></select>
        </label>
        <DueEditor v-model="nDue" :trip="trip" :home-timezone="homeTz" />
        <button type="submit" class="primary block">Add</button>
      </form>
    </Sheet>
  </div>
</template>
