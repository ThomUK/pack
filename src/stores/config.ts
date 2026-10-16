import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { RepoConfig } from '@/lib/github'

const KEY = 'pack-config'

export interface AppConfig extends RepoConfig {
  meId: string | null
  /** Trip the home screen focuses on; null = auto (next upcoming/current). */
  currentTripId: string | null
}

const DEFAULTS: AppConfig = { token: '', owner: '', repo: 'pack-data', branch: 'main', meId: null, currentTripId: null }

function load(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppConfig>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(load())

  watch(
    config,
    (c) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(c))
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  )

  const hasRepo = computed(() => !!config.value.token && !!config.value.owner && !!config.value.repo && !!config.value.branch)
  const repoConfig = computed<RepoConfig>(() => ({
    token: config.value.token,
    owner: config.value.owner,
    repo: config.value.repo,
    branch: config.value.branch,
  }))

  function setRepo(c: RepoConfig): void {
    config.value = { ...config.value, ...c }
  }
  function setMe(id: string | null): void {
    config.value.meId = id
  }
  function setCurrentTrip(id: string | null): void {
    config.value.currentTripId = id
  }
  function clear(): void {
    config.value = { ...DEFAULTS }
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  return { config, hasRepo, repoConfig, setRepo, setMe, setCurrentTrip, clear }
})
