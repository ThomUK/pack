<script setup lang="ts">
// A checkbox drawn by us rather than the browser, so its state always follows
// the data (a native checkbox whose click is cancelled snaps back after Vue
// has drawn the tick).
defineProps<{ checked: boolean; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="checkbox-btn"
    :class="{ on: checked }"
    :aria-checked="checked"
    :aria-label="label"
    :disabled="disabled"
    @click.stop="emit('toggle')"
  >
    <svg v-if="checked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
  </button>
</template>

<style scoped>
.checkbox-btn {
  width: 26px;
  height: 26px;
  min-height: 0;
  padding: 0;
  border: 2px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--accent-text);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.checkbox-btn.on {
  background: var(--accent);
  border-color: var(--accent);
}
.checkbox-btn svg {
  width: 18px;
  height: 18px;
}
.checkbox-btn:disabled {
  opacity: 0.5;
}
</style>
