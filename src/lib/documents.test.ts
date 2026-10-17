import { describe, it, expect } from 'vitest'
import { assessDocument, documentsFields, documentProblems } from './documents'
import type { Person, Task, Trip } from './models'

const person = (documents: Person['documents']): Person => ({ id: 'tom', name: 'Tom', role: 'adult', managedBy: 'self', documents })
const end = new Date('2027-02-21T15:00:00Z')

describe('assessDocument', () => {
  it('reports a missing document', () => {
    expect(assessDocument(person([]), 'passport', end).status).toBe('missing')
    expect(assessDocument(person(undefined), 'ghic', end).status).toBe('missing')
  })
  it('flags expiry before the trip ends as a problem', () => {
    const a = assessDocument(person([{ id: '1', type: 'ghic', label: '', number: '', expires: '2027-02-20' }]), 'ghic', end)
    expect(a.status).toBe('problem')
  })
  it('applies the six-month rule to passports only', () => {
    const soon = '2027-05-01'
    expect(assessDocument(person([{ id: '1', type: 'passport', label: '', number: '', expires: soon }]), 'passport', end).status).toBe('warn')
    expect(assessDocument(person([{ id: '1', type: 'ghic', label: '', number: '', expires: soon }]), 'ghic', end).status).toBe('ok')
  })
  it('uses the longest-lasting document when there are several', () => {
    const a = assessDocument(
      person([
        { id: '1', type: 'passport', label: 'old', number: '', expires: '2027-01-01' },
        { id: '2', type: 'passport', label: 'new', number: '', expires: '2036-01-01' },
      ]),
      'passport',
      end,
    )
    expect(a.status).toBe('ok')
    expect(a.document?.label).toBe('new')
  })
  it('warns when no expiry is recorded', () => {
    expect(assessDocument(person([{ id: '1', type: 'passport', label: '', number: '', expires: null }]), 'passport', end).status).toBe('warn')
  })
})

describe('documentsFields migration', () => {
  const task = (fields: Record<string, unknown>): Task =>
    ({ id: 't', kind: 'documents', title: '', notes: '', assigneeId: null, phase: 'before', due: { kind: 'none' }, status: 'todo', completedBy: null, completedAt: null, checklist: [], fields, attachmentIds: [], templateId: null, updatedAt: '' }) as Task
  it('reads the old per-check shape', () => {
    const f = documentsFields(task({ checks: [{ personId: 'tom', docType: 'GHIC / EHIC', expires: '2027-01-01', checked: true }] }))
    expect(f).toEqual({ documentType: 'ghic', checks: [{ personId: 'tom', checked: true }] })
  })
  it('defaults old passport tasks to passport', () => {
    expect(documentsFields(task({ checks: [{ personId: 'tom', docType: 'Passport', expires: null, checked: false }] })).documentType).toBe('passport')
  })
})

describe('documentProblems', () => {
  it('lists travellers whose documents are missing or expire too early', () => {
    const people: Person[] = [
      person([{ id: '1', type: 'passport', label: '', number: '', expires: '2027-02-01' }]),
      { id: 'kid', name: 'Kid', role: 'child', managedBy: 'parent', documents: [{ id: '2', type: 'passport', label: '', number: '', expires: '2030-01-01' }] },
      { id: 'jane', name: 'Jane', role: 'adult', managedBy: 'self' },
    ]
    const trip = { id: 'x', startDate: '2027-02-14', travellers: ['tom', 'kid', 'jane'], legs: [] } as unknown as Trip
    const t = { kind: 'documents', fields: { documentType: 'passport', checks: [] } } as unknown as Task
    const problems = documentProblems(trip, t, people)
    expect(problems.map((p) => `${p.person.id}:${p.status}`)).toEqual(['tom:problem', 'jane:missing'])
  })
})
