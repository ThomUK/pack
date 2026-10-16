import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'error' | 'saving'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  text: string
  action?: ToastAction
}

let nextId = 1

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const now = ref(new Date())

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => (online.value = true))
    window.addEventListener('offline', () => (online.value = false))
    setInterval(() => (now.value = new Date()), 30 * 1000)
  }

  function toast(text: string, kind: ToastKind = 'info', ms = 2500, action?: ToastAction): number {
    const id = nextId++
    toasts.value.push({ id, kind, text, action })
    if (ms > 0) setTimeout(() => dismiss(id), ms)
    return id
  }
  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, online, now, toast, dismiss }
})
