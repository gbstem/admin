import { db } from '$lib/client/firebase'
import { registrationsCollection } from '$lib/data/collections'
import { doc, getDoc, runTransaction } from 'firebase/firestore'

/**
 * Service providing Data Access Layer for Admin Registration review & editing.
 */
export const registrationService = {
  /**
   * Fetches a single registration document from the given (possibly semester-scoped) collection.
   */
  async fetchRegistration(
    collectionPath: string,
    registrationId: string,
  ): Promise<Data.Registration<'client'> | null> {
    const snap = await getDoc(doc(db, collectionPath, registrationId))
    if (!snap.exists()) {
      return null
    }
    return snap.data() as Data.Registration<'client'>
  },

  /**
   * Toggles a registration's `agreements.bypassAgeLimits` flag.
   *
   * Note: this always targets the current semester's registrations collection,
   * regardless of which semester is being viewed - this mirrors pre-existing
   * behavior rather than deriving the semester from a caller-provided path.
   */
  async toggleBypassAgeLimits(registrationId: string): Promise<void> {
    const registrationDocRef = doc(db, registrationsCollection, registrationId)
    // A transaction, since the new value is the old one flipped: two admins
    // toggling at once would otherwise both read the same value and both
    // write its opposite.
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(registrationDocRef)
      if (!snap.exists()) {
        return
      }
      transaction.update(registrationDocRef, {
        'agreements.bypassAgeLimits': !snap.data().agreements.bypassAgeLimits,
      })
    })
  },
}
