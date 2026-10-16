<script setup lang="ts">
import type { Person } from '@/lib/models'

defineProps<{ people: Person[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

function toggle(id: string, current: string[]) {
  emit('update:modelValue', current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
}
</script>

<template>
  <div class="row wrap">
    <button
      v-for="p in people"
      :key="p.id"
      type="button"
      class="chip selectable"
      :class="{ on: modelValue.includes(p.id) }"
      @click="toggle(p.id, modelValue)"
    >
      {{ p.name }}
    </button>
  </div>
</template>
