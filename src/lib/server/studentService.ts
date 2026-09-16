import {
  registrationsCollection,
  classesCollection,
} from '$lib/data/collections'
import { resolveRegistrationParentEmails } from '$lib/server/accountEmails'
import { adminDb, toDateSafe } from '$lib/server/firebase'
import {
  toRegistrationRow,
  type AdminRegistrationRow,
} from '$lib/server/registrationService'
import { searchIndex } from '$lib/server/search'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

/**
 * A registration as the admin students page shows it - the same row the
 * registrations page uses, parent account address included.
 */
export type AdminStudentRow = AdminRegistrationRow

export interface FetchStudentsOptions {
  /** `'submitted' | 'enrolled'`; anything else (including null) shows submitted registrations. */
  filter?: string | null
  /** A course name, or `'all'`/null for every course. */
  course?: string | null
  limit: number
  offset: number
}

type StudentSearchHit = Omit<
  Data.Registration<'server'>,
  'meta' | 'timestamps'
> & {
  meta: {
    uid: string
    submitted: boolean
  }
  timestamps: {
    updated: Date
    created: Date
  }
}

/**
 * Firestore's `array-contains-any` allows at most 30 values, so a course
 * with more sections than that only narrows to its first 30 class ids.
 */
const MAX_ARRAY_CONTAINS_ANY = 30

/**
 * Service providing the server-side Data Access Layer for the admin
 * Students page.
 */
export const studentService = {
  /**
   * One page of registrations, optionally narrowed to one course (resolved
   * to that course's class ids first, since a registration only stores the
   * classes it's enrolled in, not the course names).
   */
  async fetchStudents({
    filter,
    course,
    limit,
    offset,
  }: FetchStudentsOptions): Promise<AdminStudentRow[]> {
    let dbQuery: Query = adminDb.collection(registrationsCollection)

    if (filter === 'enrolled') {
      dbQuery = dbQuery.where('enrolled', '==', true)
    } else {
      dbQuery = dbQuery.where('meta.submitted', '==', true)
    }

    if (course && course !== 'all') {
      const classesSnapshot = await adminDb
        .collection(classesCollection)
        .where('course', '==', course)
        .get()
      const classIds = classesSnapshot.docs.map((doc) => doc.id)
      if (classIds.length === 0) {
        return []
      }
      dbQuery = dbQuery.where(
        'classes',
        'array-contains-any',
        classIds.slice(0, MAX_ARRAY_CONTAINS_ANY),
      )
    }

    dbQuery = dbQuery
      .orderBy('timestamps.updated', 'desc')
      .limit(limit)
      .offset(offset)

    const snapshot = await dbQuery.get()
    const emails = await resolveRegistrationParentEmails(
      snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.id),
    )

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() as Data.Registration<'server'>
      return toRegistrationRow(
        doc.id,
        {
          ...data,
          timestamps: {
            updated: toDateSafe(
              data.timestamps.updated,
              doc.id,
              'timestamps.updated',
            ),
            created: toDateSafe(
              data.timestamps.created,
              doc.id,
              'timestamps.created',
            ),
          },
        },
        emails,
      )
    })
  },

  /** Full-text search over registrations. */
  async searchStudents(query: string): Promise<AdminStudentRow[]> {
    const hits = await searchIndex<StudentSearchHit>(
      registrationsCollection,
      query,
    )
    const emails = await resolveRegistrationParentEmails(
      hits.map((hit) => hit.objectID),
    )
    return hits.map((hit) =>
      toRegistrationRow(
        hit.objectID,
        {
          personal: hit.personal,
          academic: hit.academic,
          program: hit.program,
          inPerson: hit.inPerson,
          agreements: hit.agreements,
          meta: hit.meta,
          timestamps: hit.timestamps,
        },
        emails,
      ),
    )
  },
}
