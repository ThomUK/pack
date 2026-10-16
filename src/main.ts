import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { useUiStore } from './stores/ui'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

const loadedAt = Date.now()
registerSW({
  immediate: true,
  onNeedReload() {
    // A new version has taken control. If the page has only just opened (the
    // user refreshed), reload straight away; otherwise let them choose, and
    // reload automatically the next time the app comes back into view.
    if (Date.now() - loadedAt < 10_000) {
      window.location.reload()
      return
    }
    const ui = useUiStore(pinia)
    ui.toast('Pack has been updated', 'info', 0, { label: 'Reload', run: () => window.location.reload() })
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'visible') window.location.reload()
      },
      { once: true },
    )
  },
})
