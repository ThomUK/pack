<script setup lang="ts">
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" :aria-label="title">
        <div class="sheet-head">
          <h2>{{ title }}</h2>
          <button class="ghost" aria-label="Close" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
