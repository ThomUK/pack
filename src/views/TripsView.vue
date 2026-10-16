<script setup lang="ts">
import { computed } from 'vue'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { useConfigStore } from '@/stores/config'
import { tripState, departureDate, endDate, fmtDate, type TripState } from '@/lib/time'
import { beforeCompletion } from '@/lib/progress'
import type { Trip } from '@/lib/models'
import Progress from '@/components/Progress.vue'

const repo = useRepoStore()
const ui = useUiStore()
const cfg = useConfigStore()

const homeTz = computed(() => repo.family?.homeTimezone ?? 'UTC')

interface Row {
  trip: Trip
  state: TripState
  dep: Date | null
  end: Date | null
}

const rows = computed<Row[]>(() =>
  repo.trips
    .map((trip) => ({ trip, state: tripState(trip, ui.now), dep: departureDate(trip), end: endDate(trip) }))
    .sort((a, b) => (a.dep?.getTime() ?? 0) - (b.dep?.getTime() ?? 0)),
)

const groups = computed(() => {
  const order: TripState[] = ['current', 'upcoming', 'unscheduled', 'archived']
  const labels: Record<TripState, string> = { current: 'Happening now', upcoming: 'Upcoming', unscheduled: 'No dates yet', archived: 'Past trips' }
  return order
    .map((state) => ({ state, label: labels[state], rows: rows.value.filter((r) => r.state === state) }))
    .filter((g) => g.rows.length)
    .map((g) => (g.state === 'archived' ? { ...g, rows: [...g.rows].reverse() } : g))
})

function dates(r: Row): string {
  if (!r.dep || !r.end) return 'No legs yet'
  const a = fmtDate(r.dep, homeTz.value)
  const b = fmtDate(r.end, homeTz.value)
  return a === b ? a : `${a} – ${b}`
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Trips</h1>
      <router-link class="btn primary" :to="{ name: 'trip-new' }">+ New trip</router-link>
    </div>

    <div v-if="repo.status === 'loading' && !rows.length" class="empty">Loading…</div>
    <div v-else-if="!rows.length" class="empty">
      <p>No trips yet.</p>
      <router-link class="btn primary" :to="{ name: 'trip-new' }">Plan your first trip</router-link>
    </div>

    <section v-for="g in groups" :key="g.state">
      <h2 class="muted small" style="text-transform: uppercase; letter-spacing: 0.04em; margin: 1rem 0 0.5rem">{{ g.label }}</h2>
      <router-link v-for="r in g.rows" :key="r.trip.id" class="card" style="display: block; text-decoration: none; color: inherit" :to="{ name: 'trip', params: { id: r.trip.id } }">
        <div class="row between">
          <h3 style="margin: 0">{{ r.trip.name }}</h3>
          <span v-if="cfg.config.currentTripId === r.trip.id" class="chip accent">Current</span>
        </div>
        <div class="small muted">{{ dates(r) }} · {{ r.trip.travellers.length }} travelling</div>
        <div v-if="r.state !== 'archived'" style="margin-top: 0.5rem">
          <Progress :done="beforeCompletion(r.trip).done" :total="beforeCompletion(r.trip).total" />
        </div>
      </router-link>
    </section>
  </div>
</template>
