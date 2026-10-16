<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useConfigStore } from '@/stores/config'

const repo = useRepoStore()
const cfg = useConfigStore()
const router = useRouter()
const route = useRoute()

function pick(id: string) {
  cfg.setMe(id)
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  router.replace(next)
}
</script>

<template>
  <div class="page">
    <h1>Who are you?</h1>
    <p class="muted">Used to show "my" tasks and to record who ticked things off.</p>
    <div v-if="repo.status === 'loading'" class="empty">Loading…</div>
    <div v-else-if="!repo.family" class="empty">
      No family set up yet. <router-link :to="{ name: 'family' }">Set one up</router-link>.
    </div>
    <div v-else class="stack">
      <button v-for="p in repo.family.people" :key="p.id" class="block" :class="{ primary: p.id === cfg.config.meId }" @click="pick(p.id)">
        {{ p.name }} <span class="muted small">· {{ p.role }}</span>
      </button>
    </div>
  </div>
</template>
