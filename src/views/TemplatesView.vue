<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { slugify } from '@/lib/ids'
import type { TripTemplate } from '@/lib/models'

const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()
const newName = ref('')
const busy = ref(false)

async function create() {
  const name = newName.value.trim()
  if (!name) return
  const id = slugify(name)
  if (repo.template(id)) {
    ui.toast('A template with that name exists', 'error')
    return
  }
  const tpl: TripTemplate = { version: 1, id, name, tasks: [], packing: { child: [], adultDefault: [], byPerson: {} } }
  busy.value = true
  try {
    await repo.createTemplate(tpl)
    router.push({ name: 'template', params: { id } })
  } catch (e) {
    ui.toast(`Could not create: ${e instanceof Error ? e.message : e}`, 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Trip templates</h1>
      <router-link class="btn ghost" :to="{ name: 'settings' }">Back</router-link>
    </div>
    <p class="small muted">Templates are starting points. Changing one never changes existing trips.</p>
    <div class="card">
      <ul class="list">
        <li v-for="t in repo.templates" :key="t.id" class="clickable" @click="router.push({ name: 'template', params: { id: t.id } })">
          <div class="grow">
            <b>{{ t.name }}</b>
            <div class="small muted">{{ t.tasks.length }} tasks · {{ t.packing.adultDefault.length }} adult items · {{ t.packing.child.length }} child items</div>
          </div>
          <span class="muted">›</span>
        </li>
      </ul>
    </div>
    <form class="row" @submit.prevent="create">
      <input v-model="newName" class="grow" type="text" placeholder="New template name" />
      <button type="submit" :disabled="!newName.trim() || busy || !repo.canEdit">Create</button>
    </form>
  </div>
</template>
