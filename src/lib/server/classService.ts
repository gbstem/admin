import { toDate } from '#lib/shared/timestamps.js'
import type { editClassFormSchema } from '#lib/components/forms/schemas.js'
import {
  classesCollection,
  semesterCollectionPath,
  withSemester,
} from '#lib/data/collections.js'
import { computeUpdatedClassStatuses } from '#lib/helpers/classStatuses.js'
import { classEditedFields } from '#lib/helpers/editClassForm.js'
import { resolveAccountEmails } from '#lib/server/accountEmails.js'
import { adminDb } from '#lib/server/firebase.js'
import { searchIndex } from '#lib/server/search.js'
import { formatClassTimes } from '#lib/utils.js'
import { error } from '@sveltejs/kit'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { z } from 'zod'

/** A class as the admin classes page shows it. */
export interface AdminClassRow {
  id: string
  name: string
  /**
   * The instructor's current address, resolved from `instructorUid`. Empty
   * when the class records no uid, or the account it names is gone - no
   * address is read off the class document, where a stored copy went stale
   * the moment its owner changed their account email.
   */
  email: string
  courses: string[]
  students: string[]
  meetingLink: string
  classStatuses: string[]
  classTimes: string[]
}

export interface FetchClassesOptions {
  /** A course name, or `'all'`/null for every course. */
  filter?: string | null
  limit: number
  offset: number
}

type ClassSearchHit = Omit<
  Data.Class,
  'classCap' | 'meetingTimes' | 'feedbackCompleted'
> & {
  meta: {
    id: string
    uid: string
    submitted: boolean
    decision: string | null
  }
  timestamps: {
    updated: Date
    created: Date
  }
}

function toClassRow(
  id: string,
  data: Pick<
    Data.Class,
    | 'instructorFirstName'
    | 'instructorLastName'
    | 'instructorUid'
    | 'course'
    | 'students'
    | 'meetingLink'
    | 'classStatuses'
    | 'classDay1'
    | 'classDay2'
    | 'classTime1'
    | 'classTime2'
  >,
  emails: Map<string, string>,
): AdminClassRow {
  return {
    id,
    name: `${data.instructorFirstName} ${data.instructorLastName}`,
    email: emails.get(data.instructorUid) ?? '',
    courses: Array.of(data.course),
    students: data.students,
    meetingLink: data.meetingLink,
    classStatuses: data.classStatuses,
    classTimes: formatClassTimes(
      [data.classDay1, data.classDay2],
      [data.classTime1, data.classTime2],
    ),
  }
}

/**
 * Service providing the server-side Data Access Layer for the admin Classes
 * page.
 */
export const classService = {
  /** One page of classes, optionally narrowed to one course. */
  async fetchClasses({
    filter,
    limit,
    offset,
  }: FetchClassesOptions): Promise<AdminClassRow[]> {
    let dbQuery: Query
    if (filter && filter !== 'all') {
      dbQuery = adminDb
        .collection(classesCollection)
        .where('course', '==', filter)
        .orderBy('course')
    } else {
      dbQuery = adminDb.collection(classesCollection).orderBy('course')
    }
    dbQuery = dbQuery.limit(limit).offset(offset)

    const snapshot = await dbQuery.get()
    const classes = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      data: doc.data() as Data.Class,
    }))

    // One batched Auth lookup for the page, not one per row.
    const emails = await resolveAccountEmails(
      classes.map(({ data }) => data.instructorUid).filter(Boolean),
    )
    return classes.map(({ id, data }) => toClassRow(id, data, emails))
  },

  /** Full-text search over classes. */
  async searchClasses(query: string): Promise<AdminClassRow[]> {
    const hits = await searchIndex<ClassSearchHit>(classesCollection, query)
    const emails = await resolveAccountEmails(
      hits.map((hit) => hit.instructorUid).filter(Boolean),
    )
    return hits.map((hit) => toClassRow(hit.objectID, hit, emails))
  },

  /**
   * Saves an admin's or reviewer's edits to one class: the fields
   * EditClassForm owns, merged in, so the roster, schedule and instructors
   * that other writers keep are never overwritten from the dialog's copy.
   *
   * `formData` has to have passed `editClassFormSchema`; the
   * `/classes?/saveClass` action validates it. Refuses (404) a class that
   * doesn't exist rather than creating a stray one.
   */
  async saveClassEdits(
    semesterId: string,
    classId: string,
    formData: z.infer<typeof editClassFormSchema>,
  ): Promise<void> {
    const ref = adminDb.doc(
      `${semesterCollectionPath(semesterId, 'classes')}/${classId}`,
    )
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists) {
        throw error(404, 'Class not found.')
      }
      transaction.set(
        ref,
        withSemester(classEditedFields(formData), semesterId),
        { merge: true },
      )
    })
  },

  /**
   * Brings a class's per-session statuses up to date with the clock (see
   * computeUpdatedClassStatuses) and returns them, writing only when one
   * changed. Everything is worked out from the class as stored; the caller
   * names the class and nothing else.
   */
  async refreshClassStatuses(
    classId: string,
    now: Date = new Date(),
  ): Promise<string[]> {
    const ref = adminDb.doc(`${classesCollection}/${classId}`)
    return adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists) {
        throw error(404, 'Class not found.')
      }
      const klass = snap.data() as Data.Class
      const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
        klass.classStatuses ?? [],
        klass.feedbackCompleted ?? [],
        (klass.meetingTimes ?? []).map(toDate),
        now,
      )
      if (hasChanged) {
        transaction.update(ref, { classStatuses: updatedStatuses })
      }
      return updatedStatuses
    })
  },
}
