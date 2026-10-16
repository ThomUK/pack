<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ done: number; total: number }>()
const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
</script>

<template>
  <div class="row">
    <div class="progress grow"><div :style="{ width: pct + '%' }" /></div>
    <span class="small muted">{{ done }}/{{ total }}</span>
  </div>
</template>
