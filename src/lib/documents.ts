// Travel documents belong to people. A trip's documents task only reads them
// and reports whether each traveller is covered for the trip dates.
import type { Person, PersonDocument, DocumentType, DocumentsTaskFields, Task, Trip } from './models'
import { endDate } from './time'

export type DocumentStatus = 'ok' | 'warn' | 'problem' | 'missing'

export interface DocumentAssessment {
  person: Person
  document: PersonDocument | null
  status: DocumentStatus
  message: string
}

const SIX_MONTHS_MS = 183 * 86400000

/** Label for use mid-sentence ("no passport recorded", "no GHIC / EHIC card recorded"). */
export function documentNoun(type: DocumentType): string {
  const nouns: Record<DocumentType, string> = {
    passport: 'passport',
    ghic: 'GHIC / EHIC card',
    licence: 'driving licence',
    visa: 'visa / ETA',
    insurance: 'travel insurance',
    other: 'document',
  }
  return nouns[type]
}

export function documentsOf(person: Person, type: DocumentType): PersonDocument[] {
  return (person.documents ?? []).filter((d) => d.type === type)
}

/** Assess one person's document of a type against the trip end date. */
export function assessDocument(person: Person, type: DocumentType, tripEnd: Date | null): DocumentAssessment {
  const docs = documentsOf(person, type)
  if (!docs.length) return { person, document: null, status: 'missing', message: `No ${documentNoun(type)} recorded` }
  // Use the document that lasts longest.
  const document = [...docs].sort((a, b) => (b.expires ?? '9999').localeCompare(a.expires ?? '9999'))[0]!
  if (!document.expires) return { person, document, status: 'warn', message: 'No expiry date recorded' }
  const exp = new Date(document.expires + 'T23:59:59')
  if (!tripEnd) return { person, document, status: 'ok', message: `Expires ${document.expires}` }
  if (exp.getTime() < tripEnd.getTime()) return { person, document, status: 'problem', message: `Expires ${document.expires}, before the trip ends` }
  if (type === 'passport' && exp.getTime() < tripEnd.getTime() + SIX_MONTHS_MS) {
    return { person, document, status: 'warn', message: `Expires ${document.expires}: less than 6 months after the trip, which some countries require` }
  }
  return { person, document, status: 'ok', message: `Expires ${document.expires}` }
}

/** Read a documents task's fields, tolerating the earlier per-check shape. */
export function documentsFields(task: Task): DocumentsTaskFields {
  type LegacyCheck = { personId: string; checked: boolean; docType?: string }
  const f = task.fields as { documentType?: DocumentType; checks?: LegacyCheck[] }
  let documentType = f.documentType
  if (!documentType) {
    const legacy = f.checks?.find((c) => c.docType)?.docType ?? ''
    documentType = /ehic|ghic/i.test(legacy) ? 'ghic' : 'passport'
  }
  return {
    documentType,
    checks: (f.checks ?? []).map((c) => ({ personId: c.personId, checked: !!c.checked })),
  }
}

export function assessTask(trip: Trip, task: Task, people: Person[]): DocumentAssessment[] {
  const f = documentsFields(task)
  const tripEnd = endDate(trip)
  return trip.travellers
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => !!p)
    .map((p) => assessDocument(p, f.documentType, tripEnd))
}

export function documentProblems(trip: Trip, task: Task, people: Person[]): DocumentAssessment[] {
  return assessTask(trip, task, people).filter((a) => a.status === 'problem' || a.status === 'missing')
}
