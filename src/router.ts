import { createRouter, createWebHashHistory } from 'vue-router'
import { useConfigStore } from './stores/config'
import { useRepoStore } from './stores/repo'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue'), meta: { public: true } },
    { path: '/family', name: 'family', component: () => import('./views/FamilyView.vue'), meta: { allowEmpty: true } },
    { path: '/who', name: 'who', component: () => import('./views/WhoView.vue'), meta: { allowNoMe: true } },
    { path: '/trips', name: 'trips', component: () => import('./views/TripsView.vue') },
    { path: '/trips/new', name: 'trip-new', component: () => import('./views/TripNewView.vue') },
    { path: '/trips/:id', name: 'trip', component: () => import('./views/TripView.vue'), props: true },
    { path: '/trips/:id/tasks', name: 'tasks', component: () => import('./views/TasksView.vue'), props: true },
    { path: '/trips/:id/tasks/:taskId', name: 'task', component: () => import('./views/TaskView.vue'), props: true },
    { path: '/trips/:id/packing/:personId?', name: 'packing', component: () => import('./views/PackingView.vue'), props: true },
    { path: '/templates', name: 'templates', component: () => import('./views/TemplatesView.vue') },
    { path: '/templates/:id', name: 'template', component: () => import('./views/TemplateView.vue'), props: true },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { allowNoMe: true, allowEmpty: true } },
    { path: '/share', name: 'share', component: () => import('./views/ShareView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const cfg = useConfigStore()
  const repo = useRepoStore()
  if (to.meta.public) return true
  if (!cfg.hasRepo) return { name: 'setup' }
  if (repo.status === 'empty' && !to.meta.allowEmpty) return { name: 'family' }
  if (repo.status === 'ready' && !cfg.config.meId && !to.meta.allowNoMe) return { name: 'who', query: { next: to.fullPath } }
  return true
})
