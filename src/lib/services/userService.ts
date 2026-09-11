import { db } from '$lib/client/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export interface AccountDeletionEligibility {
  canDelete: boolean
  reason: string | null
}

/**
 * Service providing Data Access Layer for user account records.
 *
 * `users/{uid}` is the canonical home for a person's name on both sites; the
 * Auth `displayName` is a derived convenience (it's what Firebase itself shows
 * in emails and the console). Keep the two in step whenever a name changes.
 */
export const userService = {
  /**
   * Reads the stored name for an account, or null when the account has no
   * `users` document. Accounts created before signup started writing one
   * legitimately have no document, so callers must handle null.
   */
  async fetchUserName(
    uid: string,
  ): Promise<{ firstName: string; lastName: string } | null> {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) {
      return null
    }
    const data = snap.data()
    return {
      firstName: data?.firstName ?? '',
      lastName: data?.lastName ?? '',
    }
  },

  /**
   * Updates a user's name fields, creating the document if it's missing.
   * `setDoc`+merge rather than `updateDoc` on purpose: admins created before
   * signup wrote a `users` document would otherwise get a `not-found` error
   * and be permanently unable to rename themselves.
   */
  async updateUserName(
    uid: string,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    await setDoc(
      doc(db, 'users', uid),
      { firstName, lastName },
      { merge: true },
    )
  },

  /**
   * Whether the signed-in account could delete itself right now - the
   * pre-flight check `DeleteAccountForm` runs on the first "Delete account"
   * click, before showing either the blocked-reason dialog or the password
   * confirmation.
   */
  async checkAccountDeletionEligibility(): Promise<AccountDeletionEligibility> {
    const res = await fetch('/api/account')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body.message ?? 'Failed to check account status.')
    }
    return body
  },

  /**
   * Deletes the signed-in account's server-side data (and, once that
   * succeeds, its Auth account) - see admin's `/api/account` DELETE and
   * `deleteAdminAccount`. Throws with the server's message on refusal
   * (e.g. a future scheduled interview) or failure.
   */
  async deleteAccountViaApi(): Promise<void> {
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? 'Failed to delete account.')
    }
  },
}
