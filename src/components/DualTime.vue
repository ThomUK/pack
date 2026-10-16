<script setup lang="ts">
import { computed } from 'vue'
import type { LocalTime } from '@/lib/models'
import { dualTime, fmtDate } from '@/lib/time'

const props = defineProps<{ value: LocalTime; homeTimezone: string; withDate?: boolean }>()
const d = computed(() => dualTime(props.value, props.homeTimezone))
const date = computed(() => fmtDate(d.value.date, props.value.tz))
</script>

<template>
  <span class="leg-time">
{{ withDate ? date + ' ' : '' }}<b>{{ d.local }}</b>
    <span v-if="d.home" class="home"> · {{ d.home }} home</span>
  </span>
</template>
