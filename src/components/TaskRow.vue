<script setup lang="ts">
import { computed } from 'vue'
import type { Task, Trip, Person } from '@/lib/models'
import { TASK_KIND_LABELS } from '@/lib/models'
import { describeDue, taskDueDate, dueState } from '@/lib/time'
import { useUiStore } from '@/stores/ui'
import CheckBox from './CheckBox.vue'

const props = defineProps<{ task: Task; trip: Trip; people: Person[]; homeTimezone: string; showAssignee?: boolean }>()
const emit = defineEmits<{ toggle: [Task]; open: [Task] }>()
const ui = useUiStore()

const assignee = computed(() => props.people.find((p) => p.id === props.task.assigneeId)?.name ?? null)
const due = computed(() => describeDue(props.trip, props.task.due, props.homeTimezone, ui.now))
const state = computed(() => (props.task.status === 'done' ? 'none' : dueState(taskDueDate(props.trip, props.task), ui.now)))
const checklistDone = computed(() => props.task.checklist.filter((c) => c.done).length)
/** Typed tasks need their details filled in; ticking them goes through the detail page. */
const quickTick = computed(() => props.task.kind === 'generic' || props.task.status === 'done')
</script>

<template>
  <li class="task-row">
    <CheckBox :checked="task.status === 'done'" :label="quickTick ? 'Done' : 'Open to complete'" @toggle="quickTick ? emit('toggle', task) : emit('open', task)" />
    <div class="grow" style="cursor: pointer" @click="emit('open', task)">
      <div class="title" :class="{ done: task.status === 'done' }">{{ task.title }}</div>
      <div class="meta">
        <span v-if="task.kind !== 'generic'" class="chip">{{ TASK_KIND_LABELS[task.kind] }}</span>
        <span v-if="showAssignee && assignee">{{ assignee }}</span>
        <span v-if="due" :class="{ overdue: state === 'overdue', 'due-today': state === 'today' }">{{ due }}</span>
        <span v-if="task.checklist.length">☑ {{ checklistDone }}/{{ task.checklist.length }}</span>
        <span v-if="task.attachmentIds.length">📎 {{ task.attachmentIds.length }}</span>
      </div>
    </div>
  </li>
</template>
