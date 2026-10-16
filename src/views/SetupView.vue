<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useRepoStore } from '@/stores/repo'
import { checkAccess, GitHubError, OfflineError } from '@/lib/github'

const cfg = useConfigStore()
const repo = useRepoStore()
const router = useRouter()

const token = ref(cfg.config.token)
const owner = ref(cfg.config.owner)
const repoName = ref(cfg.config.repo || 'pack-data')
const branch = ref(cfg.config.branch || 'main')
const busy = ref(false)
const error = ref<string | null>(null)

async function connect() {
  error.value = null
  busy.value = true
  const c = { token: token.value.trim(), owner: owner.value.trim(), repo: repoName.value.trim(), branch: branch.value.trim() || 'main' }
  try {
    const info = await checkAccess(c)
    if (!info.permissions.push) {
      error.value = `The token can read ${info.fullName} but cannot write to it. It needs Contents: read and write.`
      return
    }
    if (!branch.value.trim()) c.branch = info.defaultBranch
    cfg.setRepo(c)
    await repo.init()
    if (repo.status === 'empty') router.replace({ name: 'family' })
    else router.replace({ name: 'who' })
  } catch (e) {
    if (e instanceof OfflineError) error.value = 'You appear to be offline.'
    else if (e instanceof GitHubError && e.status === 404) error.value = 'Repo not found. Check the owner and name, and that the token has access to it.'
    else if (e instanceof GitHubError && e.isAuth) error.value = 'GitHub rejected the token.'
    else error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <h1>Pack</h1>
    <p class="muted">Family travel planning and packing. Your data lives in a private GitHub repo that everyone in the family shares.</p>

    <form class="card" @submit.prevent="connect">
      <label class="field">
        <span>Access token</span>
        <input v-model="token" type="password" autocomplete="off" required placeholder="github_pat_…" />
      </label>
      <label class="field">
        <span>Repo owner (GitHub username)</span>
        <input v-model="owner" type="text" autocapitalize="off" autocorrect="off" required />
      </label>
      <div class="grid-2">
        <label class="field">
          <span>Data repo</span>
          <input v-model="repoName" type="text" autocapitalize="off" required />
        </label>
        <label class="field">
          <span>Branch</span>
          <input v-model="branch" type="text" autocapitalize="off" />
        </label>
      </div>
      <p v-if="error" class="overdue small">{{ error }}</p>
      <button class="primary block" type="submit" :disabled="busy">{{ busy ? 'Checking…' : 'Connect' }}</button>
    </form>

    <div class="card flat small muted">
      <p><b>Setting up for the first time?</b></p>
      <ol>
        <li>Create a private GitHub repo called <span class="kbd">pack-data</span> (empty is fine).</li>
        <li>Create a fine-grained personal access token limited to that repo with <b>Contents: read and write</b>.</li>
        <li>Share the token with the family and paste it above on each device.</li>
      </ol>
      <p>The token is stored only in this browser and is sent only to api.github.com.</p>
    </div>
  </div>
</template>
