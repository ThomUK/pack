import { computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useRepoStore } from '@/stores/repo'
import { tripState, departureDate } from '@/lib/time'
import { useUiStore } from '@/stores/ui'
import type { Trip } from '@/lib/models'

/** The trip the home screen and nav focus on: the chosen one, else current, else next upcoming. */
export function useCurrentTrip() {
  const cfg = useConfigStore()
  const repo = useRepoStore()
  const ui = useUiStore()

  const sorted = computed(() => {
    const now = ui.now
    return [...repo.trips]
      .map((t) => ({ t, state: tripState(t, now), dep: departureDate(t)?.getTime() ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.dep - b.dep)
  })

  const currentTrip = computed<Trip | null>(() => {
    const chosen = cfg.config.currentTripId ? repo.trip(cfg.config.currentTripId) : null
    if (chosen) return chosen
    const current = sorted.value.find((x) => x.state === 'current')
    if (current) return current.t
    const upcoming = sorted.value.find((x) => x.state === 'upcoming' || x.state === 'unscheduled')
    if (upcoming) return upcoming.t
    return sorted.value.at(-1)?.t ?? null
  })

  return { currentTrip, sorted }
}
