import { classesCollection } from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import { formatClassTimes } from '$lib/utils'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

/** A class as the admin classes page shows it. */
export interface AdminClassRow {
  id: string
  name: string
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
    | 'instructorEmail'
    | 'course'
    | 'students'
    | 'meetingLink'
    | 'classStatuses'
    | 'classDay1'
    | 'classDay2'
    | 'classTime1'
    | 'classTime2'
  >,
): AdminClassRow {
  return {
    id,
    name: `${data.instructorFirstName} ${data.instructorLastName}`,
    email: data.instructorEmail,
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

    return snapshot.docs.map((doc: QueryDocumentSnapshot) =>
      toClassRow(doc.id, doc.data() as Data.Class),
    )
  },

  /** Full-text search over classes. */
  async searchClasses(query: string): Promise<AdminClassRow[]> {
    const hits = await searchIndex<ClassSearchHit>(classesCollection, query)
    return hits.map((hit) => toClassRow(hit.objectID, hit))
  },
}
