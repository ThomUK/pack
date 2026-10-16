<script setup lang="ts">
import type { SetupTodo } from '@/lib/setup-todos'

defineProps<{ todos: SetupTodo[] }>()
const emit = defineEmits<{ pick: [SetupTodo] }>()
</script>

<template>
  <ul class="list">
    <li v-for="t in todos" :key="t.id" class="clickable" @click="emit('pick', t)">
      <span class="chip" :class="t.level === 'blocking' ? 'danger' : 'warn'" style="min-width: 1.6rem; justify-content: center">{{ t.level === 'blocking' ? '!' : '·' }}</span>
      <span class="grow">{{ t.text }}</span>
      <span class="muted">›</span>
    </li>
  </ul>
</template>
