import { db } from '$lib/client/firebase'
import { accountEmailService } from '$lib/services/accountEmailService'
import {
  decisionsCollection,
  semesterCollectionPath,
  semesterIdFromPath,
} from '$lib/data/collections'
import {
  createDefaultInterviewValues,
  normalizeInterviewData,
} from '$lib/helpers/application'
import type {
  DecisionRequestBody,
  DecisionResponse,
} from '../../routes/api/decision/+server'
import { doc, getDoc } from 'firebase/firestore'
import { cloneDeep } from 'lodash-es'

export interface ApplicationLoadResult {
  values: Data.Application<'client'>
  decision: Data.Decision | null
  interview: Data.Interview
}

/**
 * Posts one decision write to `/api/decision`, the only way an application's
 * decision changes. Throws the route's refusal.
 */
async function postDecision(
  body: DecisionRequestBody,
): Promise<DecisionResponse> {
  const res = await fetch('/api/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      message = (await res.json()).message ?? message
    } catch {
      // Not JSON: keep the status text.
    }
    throw new Error(message)
  }
  return res.json()
}

function getDecisionsCollection(viewedSemester?: string): string {
  return viewedSemester
    ? semesterCollectionPath(viewedSemester, 'decisions')
    : decisionsCollection
}

/**
 * Data Access Layer for Admin Application Review & Decision Workflows.
 */
export const applicationService = {
  /**
   * The current address of the applicant account behind each application,
   * keyed by application id - which is the applicant's uid. An application
   * whose account is gone is absent.
   */
  fetchApplicantEmails(
    applicationIds: string[],
    semesterId?: string,
  ): Promise<Record<string, string>> {
    return accountEmailService.resolveEmailsByDocument(
      applicationIds.map((id) => ({ id, uid: id })),
      ({ ids, uids }) => ({
        intent: 'applicants',
        uids,
        context: { applicationIds: ids, semesterId },
      }),
    )
  },

  /**
   * Loads an application and its attached decision document.
   */
  async loadApplicationDetails(
    appCollection: string,
    appId: string,
  ): Promise<ApplicationLoadResult> {
    const appDocRef = doc(db, appCollection, appId)
    const appSnap = await getDoc(appDocRef)

    if (!appSnap.exists()) {
      throw new Error('Application not found.')
    }

    const data = appSnap.data() as Data.Application<'client'>
    const values = cloneDeep(data)

    let decision: Data.Decision | null = null
    let interview: Data.Interview = {
      ...cloneDeep(createDefaultInterviewValues()),
      likelyDecision: null,
    }

    if (data.meta.decided) {
      // Decision docs are always keyed by the application's own id, so the path is
      // derived here rather than trusted from a stored reference field - see the
      // meta.decided writeup for why that stored-reference shape was unsafe.
      const decColl = getDecisionsCollection(
        semesterIdFromPath(appCollection) ?? undefined,
      )
      const decisionSnap = await getDoc(doc(db, decColl, appId))
      if (decisionSnap.exists()) {
        const normalized = normalizeInterviewData(
          decisionSnap.data() as Data.Interview,
        )
        decision = normalized.decision
        interview = normalized.interview
      }
    }

    return { values, decision, interview }
  },

  /** Saves the interview scorecard's notes for an application. */
  async saveNotes(
    appId: string,
    interview: Data.Interview,
    viewedSemester: string,
  ): Promise<void> {
    await postDecision({
      action: 'saveNotes',
      semesterId: viewedSemester,
      applicationId: appId,
      interview,
    })
  },

  /** Sets, or with null clears, the likely decision for an application. */
  async saveLikelyDecision(
    appId: string,
    newLikelyDecision: Data.Interview['likelyDecision'],
    viewedSemester: string,
  ): Promise<void> {
    await postDecision({
      action: 'setLikelyDecision',
      semesterId: viewedSemester,
      applicationId: appId,
      likelyDecision: newLikelyDecision,
    })
  },

  /**
   * Records one applicant's official decision with the scorecard the dialog
   * holds; the server then emails them. Resolves to whether that email went
   * out.
   */
  async submitOfficialDecision(
    appId: string,
    newDecision: Data.Decision,
    interview: Data.Interview,
    viewedSemester: string,
  ): Promise<{ emailSent: boolean }> {
    const { emailsFailed } = await postDecision({
      action: 'decide',
      semesterId: viewedSemester,
      applicationIds: [appId],
      decision: newDecision,
      interview,
    })
    return { emailSent: emailsFailed === 0 }
  },

  /**
   * Records the same official decision for several applicants, leaving their
   * scorecards alone; the server then emails each. Resolves to how many
   * could not be emailed.
   */
  async bulkSetDecision(
    applicationIds: string[],
    decision: Data.Decision,
    viewedSemester: string,
  ): Promise<{ emailsFailed: number }> {
    return postDecision({
      action: 'decide',
      semesterId: viewedSemester,
      applicationIds,
      decision,
    })
  },
}
