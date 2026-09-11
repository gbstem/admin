import { adminDb } from '$lib/server/firebase'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

const announcementsCollection = 'announcements'

/** An announcement as the admin announcements page shows it. */
export interface AdminAnnouncementRow {
  title: string
  content: string
  timestamp: Date
}

export interface FetchAnnouncementsOptions {
  limit: number
  offset: number
}

/**
 * Service providing the server-side Data Access Layer for the admin
 * Announcements page.
 */
export const announcementService = {
  /** One page of announcements, most recent first. */
  async fetchAnnouncements({
    limit,
    offset,
  }: FetchAnnouncementsOptions): Promise<AdminAnnouncementRow[]> {
    const dbQuery = adminDb
      .collection(announcementsCollection)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .offset(offset)

    const snapshot = await dbQuery.get()

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() as Data.Announcement<'server'>
      return {
        title: data.title,
        content: data.content,
        timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
      }
    })
  },
}
