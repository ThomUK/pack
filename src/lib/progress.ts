// Completion and due summaries used by the countdown and trip list.
import type { Trip, Task, Person, PackingList, Phase } from './models'
import { taskDueDate, dueState, type DueState } from './time'

export interface TaskWithDue {
  task: Task
  dueAt: Date | null
  state: DueState
}

export function tasksWithDue(trip: Trip, now: Date = new Date()): TaskWithDue[] {
  return trip.tasks.map((task) => {
    const dueAt = taskDueDate(trip, task)
    return { task, dueAt, state: task.status === 'done' ? 'none' : dueState(dueAt, now) }
  })
}

export function sortByDue(list: TaskWithDue[]): TaskWithDue[] {
  return [...list].sort((a, b) => {
    if (a.task.status !== b.task.status) return a.task.status === 'done' ? 1 : -1
    const ad = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bd = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return a.task.title.localeCompare(b.task.title)
  })
}

export interface Completion {
  done: number
  total: number
  pct: number
}

export function completion(tasks: Task[]): Completion {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 }
}

export function phaseTasks(trip: Trip, phase: Phase): Task[] {
  return trip.tasks.filter((t) => t.phase === phase)
}

/** Tasks that count towards "ready to leave": everything in the before phase. */
export function beforeCompletion(trip: Trip): Completion {
  return completion(phaseTasks(trip, 'before'))
}

/** Tasks this person is responsible for: assigned to them, or to a child they manage, or unassigned (adults only). */
export function isMine(task: Task, me: Person, people: Person[]): boolean {
  if (task.assigneeId === me.id) return true
  if (me.role !== 'adult') return false
  if (task.assigneeId === null) return true
  const assignee = people.find((p) => p.id === task.assigneeId)
  return !!assignee && assignee.managedBy === 'parent'
}

export function perPerson(trip: Trip, people: Person[], phase: Phase = 'before'): Array<{ person: Person; completion: Completion }> {
  return people
    .filter((p) => trip.travellers.includes(p.id))
    .map((person) => ({
      person,
      completion: completion(trip.tasks.filter((t) => t.phase === phase && t.assigneeId === person.id)),
    }))
}

export function packingCompletion(list: PackingList | null): Completion {
  if (!list) return { done: 0, total: 0, pct: 100 }
  return completion(list.items.map((i) => ({ status: i.packed ? 'done' : 'todo' }) as Task))
}

export interface ShoppingItem {
  personId: string
  itemId: string
  name: string
  qty: number | null
}

export function shoppingList(lists: PackingList[]): ShoppingItem[] {
  return lists.flatMap((l) => l.items.filter((i) => i.needToBuy && !i.bought).map((i) => ({ personId: l.personId, itemId: i.id, name: i.name, qty: i.qty })))
}
