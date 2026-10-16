<script setup lang="ts">
import { computed } from 'vue'
import type { LocalTime } from '@/lib/models'
import { COMMON_TIMEZONES, isValidTimezone } from '@/lib/time'

const props = defineProps<{ modelValue: LocalTime; label: string; homeTimezone: string }>()
const emit = defineEmits<{ 'update:modelValue': [LocalTime] }>()

const zones = computed(() => {
  const z = new Set([props.homeTimezone, ...COMMON_TIMEZONES])
  if (props.modelValue.tz && isValidTimezone(props.modelValue.tz)) z.add(props.modelValue.tz)
  return [...z]
})

function setLocal(e: Event) {
  emit('update:modelValue', { ...props.modelValue, local: (e.target as HTMLInputElement).value })
}
function setTz(e: Event) {
  emit('update:modelValue', { ...props.modelValue, tz: (e.target as HTMLSelectElement).value })
}
</script>

<template>
  <div class="grid-2">
    <label class="field">
      <span>{{ label }}</span>
      <input type="datetime-local" :value="modelValue.local" @input="setLocal" />
    </label>
    <label class="field">
      <span>Time zone</span>
      <select :value="modelValue.tz" @change="setTz">
        <option v-for="z in zones" :key="z" :value="z">{{ z === homeTimezone ? `${z} (home)` : z }}</option>
      </select>
    </label>
  </div>
</template>
