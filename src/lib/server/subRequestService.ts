import { semesterDates, subRequestsCollection } from '$lib/data/collections'
import { resolveAccountEmails } from '$lib/server/accountEmails'
import { adminDb } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import type { DocumentData, Query } from 'firebase-admin/firestore'

/** A sub request as the admin sub-requests log shows it. */
export interface AdminSubRequest {
  id: string
  classNumber: number
  course: string
  /** Null when the record has no usable session date. */
  dateOfClass: Date | null
  /**
   * Both addresses are resolved from the uids beside them, and are empty when
   * there is no uid or its account is gone. Sub request documents store no
   * address: a stored copy went stale whenever either instructor changed
   * their account email.
   */
  originalInstructorEmail: string
  originalInstructorUid: string
  subInstructorId: string
  subInstructorFirstName: string
  subInstructorEmail: string
  subRequestStatus: string
  link: string
  notes: string
}

export interface FetchSubRequestsOptions {
  /** A course name, or `'all'`/null for every course. */
  course?: string | null
  limit: number
  offset: number
}

/**
 * The earliest session date the log reads. `subRequests` isn't
 * semester-scoped, so without a floor every past semester's requests are read
 * too. Registrations opening, rather than classes starting, is the floor so
 * requests for anything scheduled before the first class still show up.
 */
export function currentSemesterCutoff(): Date {
  return new Date(semesterDates.registrationsOpen)
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  const date = new Date(value as string | number | Date)
  return Number.isNaN(date.getTime()) ? null : date
}

function toAdminSubRequest(
  id: string,
  data: DocumentData,
  emails: Map<string, string>,
): AdminSubRequest {
  return {
    id,
    classNumber: data.classNumber,
    course: data.course,
    dateOfClass: toDate(data.dateOfClass),
    originalInstructorEmail: emails.get(data.originalInstructorUid) ?? '',
    originalInstructorUid: data.originalInstructorUid ?? '',
    subInstructorId: data.subInstructorId,
    subInstructorFirstName: data.subInstructorFirstName,
    subInstructorEmail: emails.get(data.subInstructorId) ?? '',
    subRequestStatus: data.subRequestStatus,
    link: data.link,
    notes: data.notes,
  }
}

/**
 * The current address of every instructor named on these requests, in one
 * batched Auth lookup for the page rather than one per row.
 */
function resolveInstructorEmails(
  requests: DocumentData[],
): Promise<Map<string, string>> {
  return resolveAccountEmails(
    requests
      .flatMap((data) => [data.originalInstructorUid, data.subInstructorId])
      .filter(Boolean),
  )
}

/**
 * Service providing the server-side Data Access Layer for Sub Requests.
 */
export const subRequestService = {
  /**
   * One page of the current semester's sub requests, latest session first,
   * optionally narrowed to one course.
   *
   * Firestore serves the course-filtered query from the `course`/`dateOfClass`
   * index in firestore.indexes.json, and the unfiltered one from
   * `dateOfClass`'s automatic single-field index.
   */
  async fetchSubRequests({
    course,
    limit,
    offset,
  }: FetchSubRequestsOptions): Promise<AdminSubRequest[]> {
    let query: Query = adminDb
      .collection(subRequestsCollection)
      .where('dateOfClass', '>=', currentSemesterCutoff())

    if (course && course !== 'all') {
      query = query.where('course', '==', course)
    }

    const snapshot = await query
      .orderBy('dateOfClass', 'desc')
      .limit(limit)
      .offset(offset)
      .get()

    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }))
    const emails = await resolveInstructorEmails(
      requests.map(({ data }) => data),
    )
    return requests.map(({ id, data }) => toAdminSubRequest(id, data, emails))
  },

  /**
   * Full-text search over sub requests. Not limited to the current semester,
   * so an admin can still look up an older request by name or email.
   */
  async searchSubRequests(query: string): Promise<AdminSubRequest[]> {
    const hits = await searchIndex<DocumentData>(subRequestsCollection, query)
    const emails = await resolveInstructorEmails(hits)
    return hits.map((hit) => toAdminSubRequest(hit.objectID, hit, emails))
  },
}
