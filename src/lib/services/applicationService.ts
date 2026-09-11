import { db } from '$lib/client/firebase'
import {
  decisionsCollection,
  semesterCollectionPath,
  semesterIdFromPath,
  withSemester,
} from '$lib/data/collections'
import {
  buildDecisionApiPayload,
  buildFullDecisionPayload,
  buildLikelyDecisionPayload,
  buildNotesPayload,
  buildScheduleInterviewPayload,
  calculateInterviewDeadline,
  createDefaultInterviewValues,
  normalizeInterviewData,
} from '$lib/helpers/application'
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import { cloneDeep } from 'lodash-es'

export interface ApplicationLoadResult {
  values: Data.Application<'client'>
  decision: Data.Decision | null
  interview: Data.Interview
}

/** Firestore's cap on writes in one batch. */
const MAX_BATCH_WRITES = 500

/**
 * Queues an application's decision document and its `meta.decided` flag on
 * one batch. The flag is what tells the admin UI a decision document exists
 * (see loadApplicationDetails), so the two land together or not at all: a
 * decision without the flag is never loaded, and the flag without a decision
 * loads nothing. They used to be two sequential writes.
 */
function queueDecision(
  batch: WriteBatch,
  decisionPath: { collection: string; id: string },
  payload: Record<string, unknown>,
  appCollection: string,
  { merge }: { merge: boolean },
) {
  const decisionRef = doc(db, decisionPath.collection, decisionPath.id)
  if (merge) {
    batch.set(decisionRef, payload, { merge: true })
  } else {
    batch.set(decisionRef, payload)
  }
  batch.update(doc(db, appCollection, decisionPath.id), {
    'meta.decided': true,
  })
}

function getDecisionsCollection(viewedSemester?: string): string {
  return viewedSemester
    ? semesterCollectionPath(viewedSemester, 'decisions')
    : decisionsCollection
}

/**
 * The field groups the admin edit form owns, each `Partial` because the write is a
 * merge: the form sends only the sub-fields it renders, and Firestore merges nested
 * maps key by key. Sub-fields it deliberately doesn't render - `personal.firstName`,
 * `lastName` and `email`, which the applicant changes from their portal profile, and
 * `program.numClasses` - are therefore left untouched instead of being rewritten from
 * the dialog's stale snapshot.
 */
export type ApplicationEditableFields = {
  [K in 'personal' | 'academic' | 'program' | 'essay' | 'agreements']: Partial<
    Data.Application<'client'>[K]
  >
}

/**
 * Data Access Layer for Admin Application Review & Decision Workflows.
 */
export const applicationService = {
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

  /**
   * Saves notes for an application's decision scorecard.
   */
  async saveNotes(
    appCollection: string,
    appId: string,
    interview: Data.Interview,
    viewedSemester?: string,
  ): Promise<void> {
    const batch = writeBatch(db)
    queueDecision(
      batch,
      { collection: getDecisionsCollection(viewedSemester), id: appId },
      withSemester(buildNotesPayload(interview), viewedSemester),
      appCollection,
      { merge: true },
    )
    await batch.commit()
  },

  /**
   * Updates likely decision status for an application.
   */
  async saveLikelyDecision(
    appCollection: string,
    appId: string,
    newLikelyDecision: 'likely yes' | 'likely no' | 'likely waitlist' | null,
    currentDecision: Data.Decision | null,
    viewedSemester?: string,
  ): Promise<void> {
    const batch = writeBatch(db)
    queueDecision(
      batch,
      { collection: getDecisionsCollection(viewedSemester), id: appId },
      withSemester(
        buildLikelyDecisionPayload(newLikelyDecision, currentDecision),
        viewedSemester,
      ),
      appCollection,
      { merge: true },
    )
    await batch.commit()
  },

  /**
   * Submits official decision and sends interview or decision notification email.
   */
  async submitOfficialDecision(
    appCollection: string,
    appId: string,
    newDecision: Data.Decision,
    interview: Data.Interview,
    applicantEmail: string,
    applicantFirstName: string,
    instructorOrientationDate: string,
    viewedSemester?: string,
  ): Promise<void> {
    const interviewDeadline = calculateInterviewDeadline(
      new Date(),
      instructorOrientationDate,
    )
    const updatedInterview = { ...interview, type: newDecision }
    const batch = writeBatch(db)
    queueDecision(
      batch,
      { collection: getDecisionsCollection(viewedSemester), id: appId },
      withSemester(buildFullDecisionPayload(updatedInterview), viewedSemester),
      appCollection,
      { merge: false },
    )
    await batch.commit()

    try {
      // Re-fetch the application to make sure we don't get stale data from
      // a Svelte UI component.
      const appSnap = await getDoc(doc(db, appCollection, appId))
      const appData = appSnap?.exists?.()
        ? (appSnap.data() as Data.Application<'client'>)
        : null
      const email = appData?.personal?.email || applicantEmail
      const firstName = appData?.personal?.firstName || applicantFirstName

      if (newDecision === 'interview') {
        const payload = buildScheduleInterviewPayload(
          appId,
          email,
          firstName,
          interviewDeadline,
        )
        const res = await fetch('/api/scheduleInterview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          console.warn(
            'Failed to send interview scheduling email:',
            res.statusText,
          )
        }
      } else {
        const payload = buildDecisionApiPayload(
          newDecision,
          appId,
          email,
          firstName,
        )
        const res = await fetch('/api/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          console.warn(
            'Failed to send decision notification email:',
            res.statusText,
          )
        }
      }
    } catch (emailErr) {
      console.warn('Email notification request failed:', emailErr)
    }
  },

  /**
   * Saves edited application field values (personal/academic/program/essay/agreements).
   *
   * Takes only the fields the edit form actually owns and merges them in, rather
   * than a full application object - the edit dialog loads `values` once when it
   * opens and can go stale relative to concurrent writes (e.g. a backfill script,
   * the applicant saving their own form in the portal, or another admin action).
   * A full `setDoc()` from that stale snapshot would silently revert whatever
   * those writers changed; merging only the edited fields can't.
   */
  async saveApplicationDetails(
    appCollection: string,
    appId: string,
    editedFields: ApplicationEditableFields,
    viewedSemester?: string,
  ): Promise<void> {
    await setDoc(
      doc(db, appCollection, appId),
      withSemester(editedFields, viewedSemester),
      { merge: true },
    )
  },

  /**
   * Bulk-assigns a decision to multiple applications, links each to its decision document,
   * and sends decision or interview notification emails.
   *
   * Every decision and its `meta.decided` flag are written in one batch before
   * any email goes out, so a failure writes nothing and emails nobody. A
   * selection past Firestore's per-batch limit is committed in chunks, each
   * atomic on its own.
   */
  async bulkSetDecision(
    applicationIds: string[],
    appCollection: string,
    decisionsColl: string,
    decision: Data.Decision,
    viewedSemester?: string,
    instructorOrientationDate?: string,
  ): Promise<void> {
    const interviewDeadline = instructorOrientationDate
      ? calculateInterviewDeadline(new Date(), instructorOrientationDate)
      : ''

    // Two writes per application: its decision and its `meta.decided`.
    const perBatch = MAX_BATCH_WRITES / 2
    for (let start = 0; start < applicationIds.length; start += perBatch) {
      const batch = writeBatch(db)
      for (const id of applicationIds.slice(start, start + perBatch)) {
        queueDecision(
          batch,
          { collection: decisionsColl, id },
          withSemester({ type: decision }, viewedSemester),
          appCollection,
          { merge: false },
        )
      }
      await batch.commit()
    }

    await Promise.all(
      applicationIds.map(async (id) => {
        try {
          const appSnap = await getDoc(doc(db, appCollection, id))
          if (appSnap.exists()) {
            const data = appSnap.data() as Data.Application<'client'>
            const applicantEmail = data.personal?.email
            const applicantFirstName = data.personal?.firstName

            if (applicantEmail && applicantFirstName) {
              if (decision === 'interview') {
                const payload = buildScheduleInterviewPayload(
                  id,
                  applicantEmail,
                  applicantFirstName,
                  interviewDeadline,
                )
                await fetch('/api/scheduleInterview', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
              } else {
                const payload = buildDecisionApiPayload(
                  decision,
                  id,
                  applicantEmail,
                  applicantFirstName,
                )
                await fetch('/api/decision', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
              }
            }
          }
        } catch (emailErr) {
          console.warn('Bulk email notification request failed:', emailErr)
        }
      }),
    )
  },
}
