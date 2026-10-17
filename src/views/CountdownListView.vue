<script setup lang="ts">
import { computed } from 'vue'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { tripState, departureDate, endDate, fmtDate, departureIsEstimate, countdown, type TripState } from '@/lib/time'
import { beforeCompletion, completion } from '@/lib/progress'
import { setupTodos } from '@/lib/setup-todos'
import type { Trip } from '@/lib/models'
import Progress from '@/components/Progress.vue'

const repo = useRepoStore()
const ui = useUiStore()
const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')

interface Row {
  trip: Trip
  state: TripState
  dep: Date | null
  end: Date | null
  days: number | null
  estimate: boolean
  ready: ReturnType<typeof completion>
  setup: number
}

const rows = computed<Row[]>(() =>
  repo.trips
    .map((trip) => {
      const state = tripState(trip, ui.now)
      const dep = departureDate(trip)
      const c = dep ? countdown(dep, ui.now) : null
      return {
        trip,
        state,
        dep,
        end: endDate(trip),
        days: c && !c.past ? c.days : null,
        estimate: departureIsEstimate(trip),
        ready: state === 'current' ? completion(trip.tasks.filter((t) => t.phase === 'during')) : beforeCompletion(trip),
        setup: setupTodos(trip, repo.family?.people ?? [], repo.packingLists(trip.id)).length,
      }
    })
    .filter((r) => r.state !== 'archived')
    .sort((a, b) => {
      if (a.state === 'current' && b.state !== 'current') return -1
      if (b.state === 'current' && a.state !== 'current') return 1
      return (a.dep?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dep?.getTime() ?? Number.MAX_SAFE_INTEGER)
    }),
)

function dates(r: Row): string {
  if (!r.dep || !r.end) return 'No date yet'
  const a = fmtDate(r.dep, homeTz.value)
  const b = fmtDate(r.end, homeTz.value)
  return a === b ? a : `${a} – ${b}`
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Countdown</h1>
      <router-link class="btn primary" :to="{ name: 'trip-new' }">+ New trip</router-link>
    </div>

    <div v-if="repo.status === 'loading' && !rows.length" class="empty">Loading…</div>
    <div v-else-if="!rows.length" class="empty">
      <p>No upcoming trips.</p>
      <router-link class="btn primary" :to="{ name: 'trip-new' }">Plan a trip</router-link>
    </div>

    <router-link v-for="r in rows" :key="r.trip.id" class="card countdown-row" :to="{ name: 'countdown', params: { id: r.trip.id } }">
      <div class="days" :class="{ now: r.state === 'current' }">
        <template v-if="r.state === 'current'"><b>now</b><span>on trip</span></template>
        <template v-else-if="r.days !== null"><b>{{ r.days }}</b><span>{{ r.days === 1 ? 'day' : 'days' }}</span></template>
        <template v-else><b>?</b><span>no date</span></template>
      </div>
      <div class="grow" style="min-width: 0">
        <h3 style="margin: 0 0 0.15rem">{{ r.trip.name }}</h3>
        <div class="small muted">
          {{ dates(r) }}<span v-if="r.estimate"> · no legs yet</span> · {{ r.trip.travellers.length }} travelling
          <span v-if="r.setup" class="due-today"> · {{ r.setup }} setup</span>
        </div>
        <div style="margin-top: 0.4rem">
          <Progress :done="r.ready.done" :total="r.ready.total" />
        </div>
      </div>
      <span class="muted">›</span>
    </router-link>

    <p class="small muted" style="text-align: center; margin-top: 1rem">
      Past trips are under <router-link :to="{ name: 'trips' }">Trips</router-link>.
    </p>
  </div>
</template>

<style scoped>
.countdown-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  text-decoration: none;
  color: inherit;
}
.days {
  width: 72px;
  flex-shrink: 0;
  text-align: center;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 0.5rem 0.2rem;
}
.days b {
  display: block;
  font-size: 1.7rem;
  line-height: 1.1;
}
.days span {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.days.now {
  background: var(--accent-soft);
  color: var(--accent);
}
.days.now b {
  font-size: 1.2rem;
  padding: 0.25rem 0;
}
</style>
