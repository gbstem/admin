import collectionsList from './collectionsList.json'
import semesterDatesJson from './semesterDates.json'

const suffix = 'Fall26'

export const currentSemester = suffix

const validSemesterIds = new Set(collectionsList.map((sem) => sem.id))

export const semesterCollectionPath = (semesterId: string, name: string) =>
  `semesters/${semesterId}/${name}`

// Falls back to the current semester if the given id isn't a known semester
// (e.g. a stale or tampered `?semester=` URL param), so callers never build
// a path from unvalidated user input.
export const resolveSemester = (semesterId: string | null | undefined) =>
  semesterId && validSemesterIds.has(semesterId) ? semesterId : currentSemester

// Extracts the semester id from a `semesters/{semesterId}/{name}` path, or
// null for collections that aren't semester-scoped (e.g. subRequests).
export const semesterIdFromPath = (path: string): string | null =>
  path.match(/^semesters\/([^/]+)\//)?.[1] ?? null

export const applicationsCollection = semesterCollectionPath(
  suffix,
  'applications',
)
// Retreat check-in records, keyed by registration document id. Not
// semester-scoped: a check-in belongs to a one-off in-person event, not a term.
// (Formerly `hhids`, an opaque name whose meaning was lost.)
export const checkInsCollection = 'checkIns'
export const classFeedbackCollection = semesterCollectionPath(
  suffix,
  'classFeedback',
)
export const classesCollection = semesterCollectionPath(suffix, 'classes')
export const decisionsCollection = semesterCollectionPath(suffix, 'decisions')
export const instructorFeedbackCollection = semesterCollectionPath(
  suffix,
  'instructorFeedback',
)
// Applicants' requests for an interview time none of the offered slots
// covers, keyed `${uid}-${date}`. Not semester-scoped.
export const interviewTimeRequestsCollection = 'interviewTimeRequests'
export const interviewTimesCollection = semesterCollectionPath(
  suffix,
  'instructorInterviewTimes',
)
export const registrationsCollection = semesterCollectionPath(
  suffix,
  'registrations',
)
// The current semester's key dates (MM/DD/YY strings), edited by hand alongside `suffix`
// each semester rollover. No longer a Firestore document - see
// src/lib/data/semesterDates.json and __tests__/collections.test.ts's format/year validation.
export const semesterDates = semesterDatesJson
export const subRequestsCollection = 'subRequests'

// Stamps a `semester` field onto a document being created/overwritten so it
// can be filtered on in the shared (cross-semester) Algolia index. Defaults
// to the current semester; pass an explicit semesterId when writing to a
// past semester's collection (e.g. editing a document opened via
// CollectionFilter). Additive and harmless if omitted at a write site.
export const withSemester = <T extends object>(
  values: T,
  semesterId: string = currentSemester,
): T & { semester: string } => ({ ...values, semester: semesterId })
