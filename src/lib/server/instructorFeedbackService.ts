import { instructorFeedbackCollection } from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

interface StoredInstructorFeedback {
  instructorName: string
  students: string[]
  attendanceList:
    Record<string, { present: boolean }> | Array<{ present: boolean }>
  date: string
  courseName: string
  feedback: string
  classNumber: number
}

/** Instructor feedback as the admin instructor-feedback page shows it. */
export interface AdminInstructorFeedbackRow {
  id: string
  instructorName: string
  courseName: string
  students: string[]
  feedback: string
  date: string
  attendanceList: boolean[]
  classNumber: number
}

export interface FetchInstructorFeedbackOptions {
  /** A course name, or `'all'`/null for every course. */
  course?: string | null
  limit: number
  offset: number
}

/**
 * `attendanceList` is stored as either a map (legacy submissions) or an
 * array (current submissions), always ordered to match `students`.
 */
function normalizeAttendanceList(
  attendanceList: StoredInstructorFeedback['attendanceList'],
): boolean[] {
  const result: boolean[] = []
  if (!attendanceList) return result
  if (Array.isArray(attendanceList)) {
    for (const entry of attendanceList) {
      result.push(entry.present)
    }
  } else {
    for (const key in attendanceList) {
      result.push(attendanceList[key].present)
    }
  }
  return result
}

function toInstructorFeedbackRow(
  id: string,
  data: StoredInstructorFeedback,
): AdminInstructorFeedbackRow {
  return {
    id,
    instructorName: data.instructorName,
    courseName: data.courseName,
    students: data.students,
    feedback: data.feedback,
    date: data.date,
    attendanceList: normalizeAttendanceList(data.attendanceList),
    classNumber: data.classNumber,
  }
}

/**
 * Service providing the server-side Data Access Layer for the admin
 * Instructor Feedback page.
 */
export const instructorFeedbackService = {
  /** One page of instructor feedback, optionally narrowed to one course. */
  async fetchInstructorFeedback({
    course,
    limit,
    offset,
  }: FetchInstructorFeedbackOptions): Promise<AdminInstructorFeedbackRow[]> {
    let dbQuery: Query = adminDb.collection(instructorFeedbackCollection)

    if (course && course !== 'all') {
      dbQuery = dbQuery.where('courseName', '==', course)
    }

    dbQuery = dbQuery.orderBy('date', 'desc').limit(limit).offset(offset)

    const snapshot = await dbQuery.get()

    return snapshot.docs.map((doc: QueryDocumentSnapshot) =>
      toInstructorFeedbackRow(doc.id, doc.data() as StoredInstructorFeedback),
    )
  },

  /** Full-text search over instructor feedback. */
  async searchInstructorFeedback(
    query: string,
  ): Promise<AdminInstructorFeedbackRow[]> {
    const hits = await searchIndex<StoredInstructorFeedback>(
      instructorFeedbackCollection,
      query,
    )
    return hits.map((hit) => toInstructorFeedbackRow(hit.objectID, hit))
  },
}
