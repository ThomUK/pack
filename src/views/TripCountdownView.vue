<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { tripOps } from '@/lib/ops'
import { departureDate, departureIsEstimate, returnDate, returnLeg, datedLegs, countdown, tripState, fmtDateTime, fmtDate, checkinOpensDate, taskDueDate } from '@/lib/time'
import { setupTodos } from '@/lib/setup-todos'
import { tasksWithDue, sortByDue, beforeCompletion, completion, perPerson, shoppingList, isMine } from '@/lib/progress'
import { buildIcs, downloadIcs, type IcsEvent } from '@/lib/ics'
import type { Task, CheckinTaskFields } from '@/lib/models'
import TaskRow from '@/components/TaskRow.vue'
import DualTime from '@/components/DualTime.vue'
import Progress from '@/components/Progress.vue'

const props = defineProps<{ id: string }>()
const repo = useRepoStore()
const cfg = useConfigStore()
const ui = useUiStore()
const router = useRouter()

const trip = computed(() => repo.trip(props.id))
// Opening a trip's countdown makes it the trip the Tasks and Packing tabs follow.
watch(
  () => trip.value?.id,
  (id) => {
    if (id) cfg.setCurrentTrip(id)
  },
  { immediate: true },
)
const people = computed(() => repo.family?.people ?? [])
const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')
const me = computed(() => repo.me())
const state = computed(() => (trip.value ? tripState(trip.value, ui.now) : 'unscheduled'))

const legs = computed(() => (trip.value ? datedLegs(trip.value) : []))
const firstLeg = computed(() => legs.value[0] ?? null)
const dep = computed(() => (trip.value ? departureDate(trip.value) : null))
const depEstimate = computed(() => !!trip.value && departureIsEstimate(trip.value))
const todoCount = computed(() => (trip.value ? setupTodos(trip.value, people.value, repo.packingLists(trip.value.id)).length : 0))
const ret = computed(() => (trip.value ? returnDate(trip.value) : null))
const retLeg = computed(() => (trip.value ? returnLeg(trip.value) : null))
const depCountdown = computed(() => (dep.value ? countdown(dep.value, ui.now) : null))
const retCountdown = computed(() => (ret.value ? countdown(ret.value, ui.now) : null))
const showReturn = ref(false)
watch(state, (s) => (showReturn.value = s === 'current'), { immediate: true })

const before = computed(() => (trip.value ? beforeCompletion(trip.value) : null))
const during = computed(() => (trip.value ? completion(trip.value.tasks.filter((t) => t.phase === 'during')) : null))
const byPerson = computed(() => (trip.value ? perPerson(trip.value, people.value, showReturn.value ? 'during' : 'before') : []))

const scope = ref<'mine' | 'all'>('all')
const attention = computed(() => {
  if (!trip.value) return []
  const phase = showReturn.value ? 'during' : 'before'
  let list = tasksWithDue(trip.value, ui.now).filter((x) => x.task.status !== 'done' && x.task.phase === phase)
  if (scope.value === 'mine' && me.value) list = list.filter((x) => isMine(x.task, me.value!, people.value))
  return sortByDue(list).filter((x) => x.state !== 'later' || true).slice(0, 12)
})
const overdueCount = computed(() => attention.value.filter((x) => x.state === 'overdue').length)

const shopping = computed(() => (trip.value ? shoppingList(repo.packingLists(trip.value.id)) : []))
const personName = (id: string | null) => people.value.find((p) => p.id === id)?.name ?? ''

function toggle(task: Task) {
  if (!trip.value || !me.value) return
  repo.commitTrip(trip.value.id, tripOps.setTaskStatus(task.id, task.status !== 'done', me.value.id))
}
function open(task: Task) {
  if (!trip.value) return
  router.push({ name: 'task', params: { id: trip.value.id, taskId: task.id } })
}

watch(
  () => trip.value?.id,
  (id) => {
    if (id) void repo.ensureOfflineFiles(id)
  },
  { immediate: true },
)

function exportCalendar() {
  const t = trip.value
  if (!t) return
  const events: IcsEvent[] = []
  if (dep.value) events.push({ uid: `${t.id}-dep`, title: `${t.name}: departure`, start: dep.value, location: firstLeg.value?.from })
  for (const task of t.tasks) {
    if (task.status === 'done') continue
    if (task.kind === 'checkin') {
      const f = task.fields as unknown as CheckinTaskFields
      const opens = checkinOpensDate(t, f.legId, f.opens)
      if (opens) events.push({ uid: `${t.id}-${task.id}-opens`, title: `Check-in opens: ${task.title}`, start: opens, description: `${t.name}` })
    }
    const due = taskDueDate(t, task)
    if (due) events.push({ uid: `${t.id}-${task.id}`, title: `Due: ${task.title}`, start: due, description: `${t.name} · ${personName(task.assigneeId) || 'anyone'}` })
  }
  downloadIcs(`${t.id}.ics`, buildIcs(events, `Pack: ${t.name}`))
  ui.toast('Calendar file downloaded', 'success')
}
</script>

<template>
  <div class="page">
    <div v-if="repo.status === 'loading' && !trip" class="empty">Loading…</div>
    <div v-else-if="!trip" class="empty">
      <p>Trip not found.</p>
      <router-link class="btn" :to="{ name: 'home' }">All countdowns</router-link>
    </div>
    <template v-else>
      <div class="page-head">
        <router-link class="btn ghost" :to="{ name: 'home' }" aria-label="Back to all trips">‹ Trips</router-link>
        <h1 class="grow" style="font-size: 1.25rem; margin: 0 0.5rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ trip.name }}</h1>
        <router-link class="btn ghost" :to="{ name: 'trip', params: { id: trip.id } }">Details ›</router-link>
      </div>

      <!-- Departure countdown -->
      <div class="card" style="text-align: center">
        <template v-if="dep && depCountdown">
          <div class="small muted" style="margin-bottom: 0.5rem">
            <template v-if="depEstimate">{{ depCountdown.past ? 'Started' : 'Starts' }} {{ fmtDate(dep, homeTz) }} · <router-link :to="{ name: 'trip', params: { id: trip.id } }">add legs for an exact time</router-link></template>
            <template v-else>{{ depCountdown.past ? 'Departed' : 'Departing' }} {{ fmtDateTime(dep, homeTz) }}<template v-if="firstLeg"> · {{ firstLeg.title }}</template></template>
          </div>
          <div v-if="!depCountdown.past" class="countdown">
            <div><b>{{ depCountdown.days }}</b><span>days</span></div>
            <div><b>{{ depCountdown.hours }}</b><span>hours</span></div>
            <div><b>{{ depCountdown.minutes }}</b><span>min</span></div>
          </div>
          <div v-else class="chip accent">{{ state === 'archived' ? 'Trip over' : 'On the trip' }}</div>
        </template>
        <template v-else>
          <p class="muted">No start date or legs yet, so no countdown.</p>
          <router-link class="btn" :to="{ name: 'trip', params: { id: trip.id } }">Set up the trip</router-link>
        </template>
        <div v-if="before" style="margin-top: 0.9rem; text-align: left">
          <div class="row between small"><span>Ready to go</span><b>{{ before.pct }}%</b></div>
          <Progress :done="before.done" :total="before.total" />
        </div>
      </div>

      <router-link v-if="todoCount" class="card row between" style="text-decoration: none; color: inherit" :to="{ name: 'trip', params: { id: trip.id } }">
        <span><b>Trip setup</b> <span class="muted small">· {{ todoCount }} thing{{ todoCount === 1 ? '' : 's' }} to sort out</span></span>
        <span class="chip warn">{{ todoCount }}</span>
      </router-link>

      <!-- Return countdown -->
      <div v-if="ret && retCountdown && retLeg" class="card">
        <div class="row between" style="cursor: pointer" @click="showReturn = !showReturn">
          <div>
            <b>Return journey</b>
            <div class="small muted">{{ retLeg.title }} · <DualTime :value="retLeg.departAt" :home-timezone="homeTz" with-date /></div>
          </div>
          <span class="chip">{{ retCountdown.past ? 'started' : `${retCountdown.days}d ${retCountdown.hours}h` }}</span>
        </div>
        <div v-if="showReturn && during" style="margin-top: 0.6rem">
          <div class="row between small"><span>Ready to come home</span><b>{{ during.pct }}%</b></div>
          <Progress :done="during.done" :total="during.total" />
        </div>
      </div>

      <!-- Per person -->
      <div v-if="byPerson.some((x) => x.completion.total)" class="card">
        <h2>By person</h2>
        <div v-for="x in byPerson" :key="x.person.id" style="margin-bottom: 0.4rem">
          <div class="small">{{ x.person.name }}</div>
          <Progress :done="x.completion.done" :total="x.completion.total" />
        </div>
      </div>

      <!-- Needs attention -->
      <div class="card">
        <div class="row between">
          <h2>{{ showReturn ? 'Before heading home' : 'Needs doing' }}<span v-if="overdueCount" class="chip danger" style="margin-left: 0.4rem">{{ overdueCount }} overdue</span></h2>
          <div class="segmented">
            <button :class="{ on: scope === 'mine' }" :disabled="!me" @click="scope = 'mine'">Mine</button>
            <button :class="{ on: scope === 'all' }" @click="scope = 'all'">All</button>
          </div>
        </div>
        <ul v-if="attention.length" class="list">
          <TaskRow v-for="x in attention" :key="x.task.id" :task="x.task" :trip="trip" :people="people" :home-timezone="homeTz" show-assignee @toggle="toggle" @open="open" />
        </ul>
        <p v-else class="small muted">All done. 🎉</p>
        <router-link class="btn small" style="margin-top: 0.5rem" :to="{ name: 'tasks', params: { id: trip.id } }">All tasks</router-link>
      </div>

      <!-- Shopping -->
      <div v-if="shopping.length" class="card">
        <h2>Shopping list</h2>
        <ul class="list">
          <li v-for="s in shopping" :key="s.personId + s.itemId">
            <span class="grow">{{ s.name }}<span v-if="s.qty" class="muted"> × {{ s.qty }}</span></span>
            <router-link class="small" :to="{ name: 'packing', params: { id: trip.id, personId: s.personId } }">{{ personName(s.personId) }}</router-link>
          </li>
        </ul>
      </div>

      <div class="row wrap">
        <button class="small" @click="exportCalendar">📅 Add deadlines to calendar</button>
      </div>
    </template>
  </div>
</template>
