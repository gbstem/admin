import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { registrationParentUid } from '$lib/data/docIds'
import { applicationService } from '$lib/services/applicationService'
import { studentService } from '$lib/services/studentService'
import { timestampToDate } from '$lib/utils'
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from 'firebase/firestore'

export interface DashboardData {
  applications: {
    total: number
    submitted: number
    decided: number
    registered: number
    totalRegistrationsStarted: number
    enrolled: number
  }
  users: {
    total: number
  }
}

export interface ClassToday {
  id: string
  classNumber: number
  class: Data.Class
}

export interface DashboardLoadResult {
  dashboardData: DashboardData
  classesToday: ClassToday[]
  uncompletedRegistrationsEmails: string[]
  uncompletedApplicationsEmails: string[]
}

const DEFAULT_TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Query timeout (${timeoutMs / 1000} seconds)`))
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

/**
 * A lookup for the copy-emails buttons. They are a convenience, so a failed
 * lookup leaves them empty rather than failing the whole dashboard.
 */
function orNoEmails(
  lookup: Promise<Record<string, string>>,
): Promise<Record<string, string>> {
  return lookup.catch((err) => {
    console.error('Could not resolve dashboard addresses:', err)
    return {}
  })
}

/** The unique addresses among `emails`, in the order the ids gave them. */
function uniqueEmails(ids: string[], emails: Record<string, string>) {
  return [...new Set(ids.map((id) => emails[id]).filter(Boolean))]
}

/**
 * Service providing Data Access Layer for the Admin Dashboard's aggregated stats.
 */
export const dashboardService = {
  /**
   * Fetches dashboard stats scoped to a reviewer or full-admin view. Rejects
   * if the underlying queries don't settle within `timeoutMs`.
   */
  async fetchDashboardData(
    reviewer: boolean,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<DashboardLoadResult> {
    const applicationsColl = collection(db, applicationsCollection)

    if (reviewer) {
      const [uncompletedApplicationsSnapshot, counts] = await withTimeout(
        Promise.all([
          getDocs(
            query(applicationsColl, where('meta.submitted', '==', false)),
          ),
          Promise.all([
            getCountFromServer(applicationsColl),
            getCountFromServer(
              query(applicationsColl, where('meta.submitted', '==', true)),
            ),
            getCountFromServer(
              query(applicationsColl, where('meta.decided', '==', true)),
            ),
          ]),
        ]),
        timeoutMs,
      )

      // Each application's current applicant address, not the stored one.
      const draftApplicationIds = uncompletedApplicationsSnapshot.docs.map(
        (docSnap: any) => docSnap.id,
      )
      const appEmails = uniqueEmails(
        draftApplicationIds,
        await orNoEmails(
          applicationService.fetchApplicantEmails(draftApplicationIds),
        ),
      )

      const [
        totalApplicationsSnapshot,
        submittedApplicationsSnapshot,
        decidedApplicationsSnapshot,
      ] = counts

      return {
        dashboardData: {
          applications: {
            total: totalApplicationsSnapshot.data().count,
            submitted: submittedApplicationsSnapshot.data().count,
            decided: decidedApplicationsSnapshot.data().count,
            registered: 0,
            totalRegistrationsStarted: 0,
            enrolled: 0,
          },
          users: { total: 0 },
        },
        classesToday: [],
        uncompletedRegistrationsEmails: [],
        uncompletedApplicationsEmails: appEmails,
      }
    }

    const usersColl = collection(db, 'users')
    const registrationsColl = collection(db, registrationsCollection)
    const classesColl = collection(db, classesCollection)

    const [
      uncompletedRegistrationsSnapshot,
      uncompletedApplicationsSnapshot,
      submittedRegistrationsSnapshot,
      counts,
      classesSnapshot,
    ] = await withTimeout(
      Promise.all([
        getDocs(query(registrationsColl, where('meta.submitted', '==', false))),
        getDocs(query(applicationsColl, where('meta.submitted', '==', false))),
        getDocs(query(registrationsColl, where('meta.submitted', '==', true))),
        Promise.all([
          getCountFromServer(applicationsColl),
          getCountFromServer(
            query(applicationsColl, where('meta.submitted', '==', true)),
          ),
          getCountFromServer(
            query(applicationsColl, where('meta.decided', '==', true)),
          ),
          getCountFromServer(usersColl),
          getCountFromServer(registrationsColl),
          getCountFromServer(
            query(registrationsColl, where('enrolled', '==', true)),
          ),
        ]),
        getDocs(query(classesColl)),
      ]),
      timeoutMs,
    )

    // Parents with an unfinished registration, less those who have submitted
    // one for another child - matched by parent account, not by address.
    const submittedParents = new Set(
      submittedRegistrationsSnapshot.docs.map((docSnap: any) =>
        registrationParentUid(docSnap.id),
      ),
    )
    const draftRegistrationIds = uncompletedRegistrationsSnapshot.docs
      .map((docSnap: any) => docSnap.id as string)
      .filter((id) => !submittedParents.has(registrationParentUid(id)))
    const draftApplicationIds = uncompletedApplicationsSnapshot.docs.map(
      (docSnap: any) => docSnap.id as string,
    )

    // Each account's current address, not the one stored on its document.
    const [parentEmails, applicantEmails] = await Promise.all([
      orNoEmails(studentService.fetchParentEmails(draftRegistrationIds)),
      orNoEmails(applicationService.fetchApplicantEmails(draftApplicationIds)),
    ])

    const [
      totalApplicationsSnapshot,
      submittedApplicationsSnapshot,
      decidedApplicationsSnapshot,
      totalUsersSnapshot,
      totalRegistrationsSnapshot,
      enrolledRegistrationsSnapshot,
    ] = counts

    // Process classes today
    const todayClasses: ClassToday[] = []
    classesSnapshot.forEach((docSnap: any) => {
      const meetingTimes = docSnap.data().meetingTimes
      if (meetingTimes !== undefined && Array.isArray(meetingTimes)) {
        for (let i = 0; i < meetingTimes.length; i++) {
          const rawTime = meetingTimes[i]
          if (rawTime) {
            const meetingTime = timestampToDate(rawTime)
            if (
              meetingTime &&
              new Date().toLocaleDateString() ===
                meetingTime.toLocaleDateString()
            ) {
              const classSession = docSnap.data() as Data.Class
              todayClasses.push({
                id: docSnap.id,
                class: classSession,
                classNumber: i,
              })
            }
          }
        }
      }
    })

    return {
      dashboardData: {
        applications: {
          total: totalApplicationsSnapshot.data().count,
          submitted: submittedApplicationsSnapshot.data().count,
          decided: decidedApplicationsSnapshot.data().count,
          registered: submittedRegistrationsSnapshot.size,
          totalRegistrationsStarted: totalRegistrationsSnapshot.data().count,
          enrolled: enrolledRegistrationsSnapshot.data().count,
        },
        users: { total: totalUsersSnapshot.data().count },
      },
      classesToday: todayClasses,
      uncompletedRegistrationsEmails: uniqueEmails(
        draftRegistrationIds,
        parentEmails,
      ),
      uncompletedApplicationsEmails: uniqueEmails(
        draftApplicationIds,
        applicantEmails,
      ),
    }
  },
}
