<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from './stores/config'
import { useRepoStore } from './stores/repo'
import { useUiStore } from './stores/ui'
import BottomNav from './components/BottomNav.vue'

const cfg = useConfigStore()
const repo = useRepoStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

let stop: (() => void) | null = null

onMounted(async () => {
  await repo.init()
  stop = repo.startAutoRefresh()
  // Route guards run before data is loaded; re-evaluate once we know the repo state.
  if (repo.status === 'empty' && !route.meta.allowEmpty) router.replace({ name: 'family' })
  else if (repo.status === 'ready' && !cfg.config.meId && !route.meta.allowNoMe) router.replace({ name: 'who' })
})
onUnmounted(() => stop?.())

watch(
  () => repo.status,
  (s) => {
    if (s === 'empty' && !route.meta.allowEmpty) router.replace({ name: 'family' })
  },
)

const showNav = computed(() => cfg.hasRepo && repo.status !== 'unconfigured' && route.name !== 'setup' && route.name !== 'who')
const banner = computed(() => {
  if (!ui.online || repo.status === 'offline') return { kind: 'offline', text: 'Offline — showing the last synced copy. Changes are disabled.' }
  if (repo.status === 'error') return { kind: 'error', text: repo.errorMessage ?? 'Something went wrong talking to GitHub' }
  return null
})
</script>

<template>
  <div v-if="banner" class="banner" :class="banner.kind">
    {{ banner.text }}
    <a v-if="banner.kind === 'error'" href="#/settings">Check settings</a>
  </div>
  <router-view />
  <BottomNav v-if="showNav" />
  <div class="toasts">
    <div v-for="t in ui.toasts" :key="t.id" class="toast row between" :class="t.kind">
      <span>{{ t.text }}</span>
      <button v-if="t.action" class="small" @click="t.action.run(); ui.dismiss(t.id)">{{ t.action.label }}</button>
    </div>
  </div>
</template>
