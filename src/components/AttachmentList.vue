<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { useRepoStore } from '@/stores/repo'
import { useUiStore } from '@/stores/ui'
import { prepareFile, fmtBytes, SOFT_LIMIT_BYTES } from '@/lib/files'
import type { Attachment } from '@/lib/models'
import Sheet from './Sheet.vue'

const props = defineProps<{
  tripId: string
  attachmentIds: string[]
  target: { taskId?: string; legId?: string; bookingId?: string }
  /** Default for the keep-offline flag on new uploads (e.g. boarding passes). */
  keepOfflineDefault?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ uploaded: [Attachment] }>()

const repo = useRepoStore()
const ui = useUiStore()

const trip = computed(() => repo.trip(props.tripId))
const attachments = computed(() => (trip.value?.attachments ?? []).filter((a) => props.attachmentIds.includes(a.id)))
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const thumbs = ref<Record<string, string>>({})
const viewing = ref<{ att: Attachment; url: string } | null>(null)

async function loadThumb(att: Attachment) {
  if (thumbs.value[att.id] || !att.mime.startsWith('image/')) return
  try {
    const blob = await repo.attachmentBlob(att)
    thumbs.value[att.id] = URL.createObjectURL(blob)
  } catch {
    /* offline and not cached */
  }
}
watch(attachments, (list) => list.forEach((a) => void loadThumb(a)), { immediate: true })
onBeforeUnmount(() => {
  Object.values(thumbs.value).forEach((u) => URL.revokeObjectURL(u))
  if (viewing.value) URL.revokeObjectURL(viewing.value.url)
})

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  await addFiles(files)
}

async function addFiles(files: File[]) {
  if (!files.length) return
  if (!repo.canEdit) {
    ui.toast('You are offline; cannot upload', 'error')
    return
  }
  busy.value = true
  try {
    for (const f of files) {
      const prepared = await prepareFile(f)
      if (prepared.bytes.byteLength > SOFT_LIMIT_BYTES) {
        ui.toast(`${f.name} is ${fmtBytes(prepared.bytes.byteLength)}; keep files under ${fmtBytes(SOFT_LIMIT_BYTES)}`, 'error', 6000)
        continue
      }
      const att = await repo.uploadAttachment(props.tripId, prepared, props.target, !!props.keepOfflineDefault)
      emit('uploaded', att)
      ui.toast(`Attached ${att.name}`, 'success')
    }
  } catch (e) {
    ui.toast(`Upload failed: ${e instanceof Error ? e.message : e}`, 'error', 6000)
  } finally {
    busy.value = false
  }
}

defineExpose({ addFiles })

async function open(att: Attachment) {
  try {
    const blob = await repo.attachmentBlob(att)
    const url = URL.createObjectURL(blob)
    if (att.mime.startsWith('image/')) {
      if (viewing.value) URL.revokeObjectURL(viewing.value.url)
      viewing.value = { att, url }
    } else {
      const w = window.open(url, '_blank')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = att.name
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  } catch (e) {
    ui.toast(`Cannot open: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

async function toggleOffline(att: Attachment) {
  try {
    await repo.setKeepOffline(props.tripId, att, !att.keepOffline)
    ui.toast(att.keepOffline ? 'Removed from offline files' : 'Saved for offline', 'success')
  } catch (e) {
    ui.toast(`Failed: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

async function remove(att: Attachment) {
  if (!confirm(`Delete ${att.name}?`)) return
  try {
    await repo.deleteAttachment(props.tripId, att)
  } catch (e) {
    ui.toast(`Delete failed: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

function closeViewer() {
  if (viewing.value) URL.revokeObjectURL(viewing.value.url)
  viewing.value = null
}
</script>

<template>
  <div>
    <ul v-if="attachments.length" class="list">
      <li v-for="a in attachments" :key="a.id">
        <img v-if="thumbs[a.id]" :src="thumbs[a.id]" class="thumb" alt="" @click="open(a)" />
        <div v-else class="file-icon" @click="open(a)">{{ a.mime === 'application/pdf' ? 'PDF' : a.name.split('.').pop() }}</div>
        <div class="grow" @click="open(a)">
          <div>{{ a.name }}</div>
          <div class="small muted">{{ fmtBytes(a.sizeBytes) }}<span v-if="a.keepOffline"> · offline</span></div>
        </div>
        <button class="ghost small" :title="a.keepOffline ? 'Stop keeping offline' : 'Keep offline'" @click="toggleOffline(a)">
          {{ a.keepOffline ? '📴' : '☁️' }}
        </button>
        <button class="ghost small danger" aria-label="Delete" @click="remove(a)">✕</button>
      </li>
    </ul>
    <p v-else-if="!compact" class="small muted">No attachments yet.</p>
    <div class="row" style="margin-top: 0.5rem">
      <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,text/plain" hidden @change="onPick" />
      <button :class="{ small: compact }" :disabled="busy || !repo.canEdit" @click="fileInput?.click()">
        {{ busy ? 'Uploading…' : '📎 Attach file or photo' }}
      </button>
    </div>

    <Sheet v-if="viewing" :title="viewing.att.name" @close="closeViewer">
      <img :src="viewing.url" alt="" style="width: 100%; height: auto; border-radius: 8px" />
    </Sheet>
  </div>
</template>
