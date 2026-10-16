<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'

const repo = useRepoStore()
const cfg = useConfigStore()
const ui = useUiStore()
const router = useRouter()

const me = computed(() => repo.me())
const lastSync = computed(() => (repo.lastSync ? repo.lastSync.toLocaleTimeString() : 'never'))

async function refresh() {
  await repo.refresh()
  ui.toast(repo.status === 'ready' ? 'Up to date' : 'Could not refresh', repo.status === 'ready' ? 'success' : 'error')
}

async function disconnect() {
  if (!confirm('Remove the token and cached data from this device?')) return
  await repo.reset()
  cfg.clear()
  router.replace({ name: 'setup' })
}
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <div class="card">
      <h2>This device</h2>
      <p>
        You are <b>{{ me?.name ?? 'not chosen' }}</b>.
        <router-link :to="{ name: 'who' }">Change</router-link>
      </p>
      <p class="small muted">Last synced {{ lastSync }} · status {{ repo.status }}</p>
      <div class="row wrap">
        <button @click="refresh">Refresh now</button>
        <router-link class="btn" :to="{ name: 'family' }">Family members</router-link>
        <router-link class="btn" :to="{ name: 'templates' }">Trip templates</router-link>
      </div>
    </div>

    <div class="card">
      <h2>Data repo</h2>
      <p class="small">
        <span class="kbd">{{ cfg.config.owner }}/{{ cfg.config.repo }}</span> on <span class="kbd">{{ cfg.config.branch }}</span>
      </p>
      <div class="row wrap">
        <router-link class="btn" :to="{ name: 'setup' }">Change token or repo</router-link>
        <button class="danger" @click="disconnect">Disconnect this device</button>
      </div>
    </div>

    <div class="card flat small muted">
      <p><b>Install on your phone</b>: open the browser menu and choose "Add to Home screen". Once installed on Android you can share screenshots and PDFs straight into Pack.</p>
      <p>Offline: the app shows the last synced copy and disables changes until you are back online.</p>
    </div>
  </div>
</template>
