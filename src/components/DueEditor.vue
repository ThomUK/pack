<script setup lang="ts">
import { computed } from 'vue'
import type { Due, Trip } from '@/lib/models'
import { sortedLegs, dueDate, fmtDateTime } from '@/lib/time'

const props = defineProps<{ modelValue: Due; trip: Trip; homeTimezone: string }>()
const emit = defineEmits<{ 'update:modelValue': [Due] }>()

const mode = computed(() => props.modelValue.kind)
const legs = computed(() => sortedLegs(props.trip))

const anchorKey = computed(() => {
  const d = props.modelValue
  if (d.kind !== 'relative') return 'departure'
  return typeof d.anchor === 'string' ? d.anchor : `leg:${d.anchor.legId}`
})
const direction = computed(() => (props.modelValue.kind === 'relative' && props.modelValue.offsetHours > 0 ? 'after' : 'before'))
const amount = computed(() => {
  if (props.modelValue.kind !== 'relative') return 1
  const h = Math.abs(props.modelValue.offsetHours)
  return h % 24 === 0 ? h / 24 : h
})
const unit = computed(() => {
  if (props.modelValue.kind !== 'relative') return 'days'
  const h = Math.abs(props.modelValue.offsetHours)
  return h % 24 === 0 && h !== 0 ? 'days' : 'hours'
})
const resolved = computed(() => dueDate(props.trip, props.modelValue))

function setMode(kind: Due['kind']) {
  if (kind === 'none') emit('update:modelValue', { kind: 'none' })
  else if (kind === 'fixed') emit('update:modelValue', { kind: 'fixed', at: resolved.value?.toISOString() ?? new Date().toISOString() })
  else emit('update:modelValue', { kind: 'relative', anchor: 'departure', offsetHours: -24 })
}
function setRelative(patch: { anchor?: string; direction?: string; amount?: number; unit?: string }) {
  const a = patch.anchor ?? anchorKey.value
  const dir = patch.direction ?? direction.value
  const amt = patch.amount ?? amount.value
  const u = patch.unit ?? unit.value
  const hours = (u === 'days' ? amt * 24 : amt) * (dir === 'after' ? 1 : -1)
  const anchor = a.startsWith('leg:') ? { legId: a.slice(4) } : (a as 'departure' | 'return')
  emit('update:modelValue', { kind: 'relative', anchor, offsetHours: hours })
}
function fixedLocal(): string {
  if (props.modelValue.kind !== 'fixed') return ''
  const d = new Date(props.modelValue.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function setFixed(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) emit('update:modelValue', { kind: 'fixed', at: new Date(v).toISOString() })
}
</script>

<template>
  <div class="field">
    <span class="small muted">Due</span>
    <div class="segmented" style="margin: 0.3rem 0">
      <button type="button" :class="{ on: mode === 'relative' }" @click="setMode('relative')">Relative</button>
      <button type="button" :class="{ on: mode === 'fixed' }" @click="setMode('fixed')">Fixed date</button>
      <button type="button" :class="{ on: mode === 'none' }" @click="setMode('none')">None</button>
    </div>
    <div v-if="mode === 'relative'" class="row wrap">
      <input type="number" min="0" step="1" style="width: 80px" :value="amount" @change="setRelative({ amount: Number(($event.target as HTMLInputElement).value) })" />
      <select style="width: auto" :value="unit" @change="setRelative({ unit: ($event.target as HTMLSelectElement).value })">
        <option value="days">days</option>
        <option value="hours">hours</option>
      </select>
      <select style="width: auto" :value="direction" @change="setRelative({ direction: ($event.target as HTMLSelectElement).value })">
        <option value="before">before</option>
        <option value="after">after</option>
      </select>
      <select style="width: auto" :value="anchorKey" @change="setRelative({ anchor: ($event.target as HTMLSelectElement).value })">
        <option value="departure">departure</option>
        <option value="return">return journey</option>
        <option v-for="l in legs" :key="l.id" :value="`leg:${l.id}`">{{ l.title }}</option>
      </select>
    </div>
    <input v-else-if="mode === 'fixed'" type="datetime-local" :value="fixedLocal()" @change="setFixed" />
    <p class="small muted" style="margin-top: 0.3rem">
      <template v-if="mode === 'none'">No due date.</template>
      <template v-else-if="resolved">= {{ fmtDateTime(resolved, homeTimezone) }}</template>
      <template v-else>Add legs to the trip to resolve this date.</template>
    </p>
  </div>
</template>
