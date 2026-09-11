import { classFeedbackCollection } from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

interface StoredStudentFeedback {
  instructor: string
  studentName: string
  feedback: string
  rating: number
  course: string
  date: string
}

/** Student feedback as the admin student-feedback page shows it. */
export interface AdminStudentFeedbackRow {
  id: string
  instructorName: string
  studentName: string
  feedback: string
  rating: number
  course: string
  date: string
}

export interface FetchStudentFeedbackOptions {
  /** A course name, or `'all'`/null for every course. */
  course?: string | null
  limit: number
  offset: number
}

function toStudentFeedbackRow(
  id: string,
  data: StoredStudentFeedback,
): AdminStudentFeedbackRow {
  return {
    id,
    instructorName: data.instructor,
    studentName: data.studentName,
    feedback: data.feedback,
    rating: data.rating,
    course: data.course,
    date: data.date,
  }
}

/**
 * Service providing the server-side Data Access Layer for the admin Student
 * Feedback page.
 */
export const studentFeedbackService = {
  /** One page of student feedback, optionally narrowed to one course. */
  async fetchStudentFeedback({
    course,
    limit,
    offset,
  }: FetchStudentFeedbackOptions): Promise<AdminStudentFeedbackRow[]> {
    let dbQuery: Query = adminDb.collection(classFeedbackCollection)

    if (course && course !== 'all') {
      dbQuery = dbQuery.where('course', '==', course)
    }

    dbQuery = dbQuery.orderBy('date', 'desc').limit(limit).offset(offset)

    const snapshot = await dbQuery.get()

    return snapshot.docs.map((doc: QueryDocumentSnapshot) =>
      toStudentFeedbackRow(doc.id, doc.data() as StoredStudentFeedback),
    )
  },

  /** Full-text search over student feedback. */
  async searchStudentFeedback(
    query: string,
  ): Promise<AdminStudentFeedbackRow[]> {
    const hits = await searchIndex<StoredStudentFeedback>(
      classFeedbackCollection,
      query,
    )
    return hits.map((hit) => toStudentFeedbackRow(hit.objectID, hit))
  },
}
