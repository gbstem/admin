import { interviewTimesCollection } from '$lib/data/collections'
import { planAdminAccountDeletion } from '$lib/helpers/accountDeletion'
import { tokenRejection } from '$lib/helpers/signupTokens'
import { adminAuth, adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

export interface NewAccount {
  uid: string
  token: string
  firstName: string
  lastName: string
}

export interface AccountDeletionEligibility {
  canDelete: boolean
  reason: string | null
}

function toSlotForDeletion(doc: QueryDocumentSnapshot) {
  const data = doc.data() as Data.InterviewSlot
  const rawDate = data.date as unknown as { toDate?: () => Date }
  return {
    id: doc.id,
    intervieweeId: data.intervieweeId,
    date:
      rawDate && typeof rawDate.toDate === 'function'
        ? rawDate.toDate()
        : new Date(data.date),
  }
}

/**
 * Records a newly created Auth account against the signup token that
 * authorized it: writes its `users` document and adds it to the token's
 * `consumers`, in one transaction that re-reads the token first.
 *
 * The signup action checks the token before it creates the Auth account, but
 * two signups racing on the same single-use token both pass that check - the
 * old code said as much and let both through. Re-reading the token inside the
 * transaction that consumes it is what makes single-use hold: the second
 * transaction sees the first consumer and throws `'consumed'`, and writes
 * nothing. It also keeps the profile and the consumption together, so a token
 * is never used up by an account with no `users` document, or the reverse.
 *
 * Throws `'fake'`, `'expired'` or `'consumed'` - the same values as
 * verifyToken - for a token that can no longer be used.
 */
export async function recordNewAccount(account: NewAccount): Promise<void> {
  const tokenRef = adminDb.collection('tokens').doc(account.token)
  const userRef = adminDb.collection('users').doc(account.uid)

  await adminDb.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef)
    if (!tokenSnap.exists) {
      throw 'fake'
    }
    const token = tokenSnap.data() as Data.Token<'server'>
    const rejection = tokenRejection(token, new Date())
    if (rejection) {
      throw rejection
    }

    transaction.set(userRef, {
      firstName: account.firstName,
      lastName: account.lastName,
    })
    transaction.update(tokenRef, {
      consumers: [...(token.consumers ?? []), account.uid],
    })
  })
}

/**
 * Whether `uid` (an admin or reviewer) could delete their own account right
 * now - see `planAdminAccountDeletion` for the rule. A plain read, for the
 * pre-flight check; `deleteAdminAccount` re-checks this same rule from
 * inside its transaction rather than trusting this result, since time can
 * pass between the two.
 */
export async function checkAdminAccountDeletionEligibility(
  uid: string,
): Promise<AccountDeletionEligibility> {
  const snapshot = await adminDb
    .collection(interviewTimesCollection)
    .where('interviewerUid', '==', uid)
    .get()
  const { canDelete, reason } = planAdminAccountDeletion(
    snapshot.docs.map(toSlotForDeletion),
    new Date(),
  )
  return { canDelete, reason }
}

/**
 * Deletes an admin/reviewer account: re-checks eligibility inside a
 * transaction (re-reading the interview slots, never trusting an earlier
 * check), and if it still passes, deletes every open (unbooked) slot this
 * account owns plus its `users` document. Only after that transaction
 * commits does it delete the Auth account - Firestore data first, Auth
 * account last, so a failure here never leaves a live account with no way to
 * retry, and a retry is a no-op over data that's already gone.
 *
 * Throws a 409 (via `error()`) with the block reason if the account can't be
 * deleted.
 */
export async function deleteAdminAccount(uid: string): Promise<void> {
  const usersRef = adminDb.collection('users').doc(uid)
  const slotsQuery = adminDb
    .collection(interviewTimesCollection)
    .where('interviewerUid', '==', uid)

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(slotsQuery)
    const { canDelete, reason, openSlotIds } = planAdminAccountDeletion(
      snapshot.docs.map(toSlotForDeletion),
      new Date(),
    )
    if (!canDelete) {
      throw error(409, reason as string)
    }
    for (const slotId of openSlotIds) {
      transaction.delete(
        adminDb.collection(interviewTimesCollection).doc(slotId),
      )
    }
    transaction.delete(usersRef)
  })

  await adminAuth.deleteUser(uid)
}
