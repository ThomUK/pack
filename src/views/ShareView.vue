<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { useCurrentTrip } from '@/composables/useCurrentTrip'
import { readSharedPayload, clearSharedPayload, type SharedPayload } from '@/lib/share'
import { prepareFile, fmtBytes } from '@/lib/files'
import { sortedLegs } from '@/lib/time'

const repo = useRepoStore()
const ui = useUiStore()
const router = useRouter()
const { currentTrip, sorted } = useCurrentTrip()

const payload = ref<SharedPayload | null>(null)
const loading = ref(true)
const tripId = ref<string>('')
const target = ref<string>('trip') // 'trip' | 'task:<id>' | 'leg:<id>'
const keepOffline = ref(false)
const busy = ref(false)

onMounted(async () => {
  payload.value = await readSharedPayload()
  loading.value = false
  tripId.value = currentTrip.value?.id ?? ''
})

const trip = computed(() => (tripId.value ? repo.trip(tripId.value) : null))
const openTasks = computed(() => trip.value?.tasks.filter((t) => t.status !== 'done') ?? [])
const legs = computed(() => (trip.value ? sortedLegs(trip.value) : []))

async function attach() {
  if (!payload.value || !trip.value) return
  busy.value = true
  try {
    const t = target.value
    const tgt = t.startsWith('task:') ? { taskId: t.slice(5) } : t.startsWith('leg:') ? { legId: t.slice(4) } : {}
    for (const f of payload.value.files) {
      const prepared = await prepareFile(f)
      await repo.uploadAttachment(trip.value.id, prepared, tgt, keepOffline.value)
    }
    await clearSharedPayload()
    ui.toast(`Attached ${payload.value.files.length} file${payload.value.files.length === 1 ? '' : 's'}`, 'success')
    if (tgt.taskId) router.replace({ name: 'task', params: { id: trip.value.id, taskId: tgt.taskId } })
    else router.replace({ name: 'trip', params: { id: trip.value.id } })
  } catch (e) {
    ui.toast(`Upload failed: ${e instanceof Error ? e.message : e}`, 'error', 6000)
  } finally {
    busy.value = false
  }
}
async function discard() {
  await clearSharedPayload()
  router.replace({ name: 'home' })
}
</script>

<template>
  <div class="page">
    <h1>Shared with Pack</h1>
    <div v-if="loading" class="empty">Reading…</div>
    <div v-else-if="!payload || !payload.files.length" class="empty">
      <p>Nothing was shared, or the files have already been handled.</p>
      <p v-if="payload?.text" class="small muted">{{ payload.text }}</p>
      <router-link class="btn" :to="{ name: 'home' }">Home</router-link>
    </div>
    <template v-else>
      <div class="card">
        <ul class="list">
          <li v-for="(f, i) in payload.files" :key="i">
            <div class="file-icon">{{ f.type.startsWith('image/') ? 'IMG' : f.type === 'application/pdf' ? 'PDF' : 'FILE' }}</div>
            <div class="grow">{{ f.name }}<div class="small muted">{{ fmtBytes(f.size) }}</div></div>
          </li>
        </ul>
      </div>
      <div class="card">
        <label class="field">
          <span>Trip</span>
          <select v-model="tripId">
            <option v-for="x in sorted" :key="x.t.id" :value="x.t.id">{{ x.t.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Attach to</span>
          <select v-model="target">
            <option value="trip">The trip (general files)</option>
            <optgroup v-if="openTasks.length" label="Tasks">
              <option v-for="t in openTasks" :key="t.id" :value="`task:${t.id}`">{{ t.title }}</option>
            </optgroup>
            <optgroup v-if="legs.length" label="Itinerary">
              <option v-for="l in legs" :key="l.id" :value="`leg:${l.id}`">{{ l.title }}</option>
            </optgroup>
          </select>
        </label>
        <label class="checkbox"><input v-model="keepOffline" type="checkbox" /> <span>Keep on this phone for offline use</span></label>
        <div class="row" style="margin-top: 0.6rem">
          <button class="primary grow" :disabled="!trip || busy || !repo.canEdit" @click="attach">{{ busy ? 'Uploading…' : 'Attach' }}</button>
          <button class="ghost" @click="discard">Discard</button>
        </div>
      </div>
    </template>
  </div>
</template>
