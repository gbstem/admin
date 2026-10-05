import { semesterCollectionPath, withSemester } from '$lib/data/collections'
import {
  buildFullDecisionPayload,
  buildLikelyDecisionPayload,
  buildNotesPayload,
} from '$lib/helpers/application'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type { Transaction } from 'firebase-admin/firestore'

/**
 * Decisions on instructor applications, written only here with the Admin SDK.
 * firestore.rules gives no client write access to `applications` or
 * `decisions`, so `/api/decision` is the only way either changes on an
 * admin's or reviewer's say-so.
 *
 * A decision document is keyed by its application's id, and the application's
 * `meta.decided` flag is what tells the admin UI that document exists. Every
 * write here sets both in one transaction, so a decision is never left
 * without its flag or the flag without a decision. An official decision also
 * copies its type to `meta.decisionType`, which interview scheduling reads (see
 * interviewIneligibility).
 */

type LikelyDecision = Data.Interview['likelyDecision']

/**
 * An applicant a decision was just recorded for, for the notification. The
 * application's id is the applicant's uid.
 */
export interface DecidedApplicant {
  applicationId: string
  firstName: string
}

/** Firestore's cap on writes in one transaction. */
const MAX_TRANSACTION_WRITES = 500

function refs(semesterId: string, applicationId: string) {
  return {
    applicationRef: adminDb.doc(
      `${semesterCollectionPath(semesterId, 'applications')}/${applicationId}`,
    ),
    decisionRef: adminDb.doc(
      `${semesterCollectionPath(semesterId, 'decisions')}/${applicationId}`,
    ),
  }
}

/** Reads the application inside `transaction`, refusing (404) a missing one. */
async function requireApplication(
  transaction: Transaction,
  semesterId: string,
  applicationId: string,
) {
  const { applicationRef, decisionRef } = refs(semesterId, applicationId)
  const snap = await transaction.get(applicationRef)
  if (!snap.exists) {
    throw error(404, `Application ${applicationId} not found.`)
  }
  return {
    applicationRef,
    decisionRef,
    application: snap.data() as Data.Application<'server'>,
  }
}

/** Merges the interview scorecard's notes into an application's decision. */
export async function saveInterviewNotes(
  semesterId: string,
  applicationId: string,
  interview: Data.Interview,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const { applicationRef, decisionRef } = await requireApplication(
      transaction,
      semesterId,
      applicationId,
    )
    transaction.set(
      decisionRef,
      withSemester(buildNotesPayload(interview), semesterId),
      { merge: true },
    )
    transaction.update(applicationRef, { 'meta.decided': true })
  })
}

/**
 * Sets (or clears, with null) an application's likely decision, leaving any
 * official decision and the scorecard as they are.
 */
export async function saveLikelyDecision(
  semesterId: string,
  applicationId: string,
  likelyDecision: LikelyDecision,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const { applicationRef, decisionRef } = await requireApplication(
      transaction,
      semesterId,
      applicationId,
    )
    const decisionSnap = await transaction.get(decisionRef)
    const currentType = (decisionSnap.data()?.type ??
      null) as Data.Decision | null
    transaction.set(
      decisionRef,
      withSemester(
        buildLikelyDecisionPayload(likelyDecision, currentType),
        semesterId,
      ),
      { merge: true },
    )
    transaction.update(applicationRef, { 'meta.decided': true })
  })
}

function decidedApplicant(
  applicationId: string,
  application: Data.Application<'server'>,
): DecidedApplicant {
  return {
    applicationId,
    firstName: application.personal?.firstName ?? '',
  }
}

/**
 * Records one applicant's official decision along with the whole scorecard
 * the decision dialog holds, replacing the decision document.
 */
export async function decideWithScorecard(
  semesterId: string,
  applicationId: string,
  decision: Data.Decision,
  interview: Data.Interview,
): Promise<DecidedApplicant> {
  return adminDb.runTransaction(async (transaction) => {
    const { applicationRef, decisionRef, application } =
      await requireApplication(transaction, semesterId, applicationId)
    transaction.set(
      decisionRef,
      withSemester(
        buildFullDecisionPayload({ ...interview, type: decision }),
        semesterId,
      ),
    )
    transaction.update(applicationRef, {
      'meta.decided': true,
      'meta.decisionType': decision,
    })
    return decidedApplicant(applicationId, application)
  })
}

/**
 * Records the same official decision for several applicants.
 *
 * Merged, unlike `decideWithScorecard`: that one writes the whole scorecard
 * it was given, but this payload is the decision alone, so replacing the
 * document would erase the interviewer's notes and likely decision for
 * everyone in the selection.
 *
 * A selection past Firestore's per-transaction limit is committed in chunks,
 * each atomic on its own. A missing application refuses its whole chunk.
 */
export async function decideInBulk(
  semesterId: string,
  applicationIds: string[],
  decision: Data.Decision,
): Promise<DecidedApplicant[]> {
  // Two writes per application: its decision and its application's meta.
  const perTransaction = MAX_TRANSACTION_WRITES / 2
  const decided: DecidedApplicant[] = []
  for (let start = 0; start < applicationIds.length; start += perTransaction) {
    const chunk = applicationIds.slice(start, start + perTransaction)
    decided.push(
      ...(await adminDb.runTransaction(async (transaction) => {
        // Firestore requires a transaction's reads before its writes.
        const targets = await Promise.all(
          chunk.map(async (id) => ({
            id,
            ...(await requireApplication(transaction, semesterId, id)),
          })),
        )
        return targets.map(
          ({ id, applicationRef, decisionRef, application }) => {
            transaction.set(
              decisionRef,
              withSemester({ type: decision }, semesterId),
              { merge: true },
            )
            transaction.update(applicationRef, {
              'meta.decided': true,
              'meta.decisionType': decision,
            })
            return decidedApplicant(id, application)
          },
        )
      })),
    )
  }
  return decided
}
