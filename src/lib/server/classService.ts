import { classesCollection } from '$lib/data/collections'
import { resolveAccountEmails } from '$lib/server/accountEmails'
import { adminDb } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import { formatClassTimes } from '$lib/utils'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

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
}
