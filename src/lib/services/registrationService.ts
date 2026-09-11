import { db } from '$lib/client/firebase'
import {
  currentSemester,
  registrationsCollection,
  semesterIdFromPath,
  withSemester,
} from '$lib/data/collections'
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore'

/**
 * The field groups the admin edit form owns, each `Partial` because the write is a
 * merge: the form sends only the sub-fields it renders, and Firestore merges nested
 * maps key by key. Sub-fields it deliberately doesn't render - `personal.parentFirstName`
 * and `parentLastName` - are therefore left untouched instead of being rewritten from
 * the dialog's stale snapshot.
 */
export type RegistrationEditableFields = {
  [
    K in 'personal' | 'academic' | 'program' | 'inPerson' | 'agreements'
  ]: Partial<Data.Registration<'client'>[K]>
}

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
   * Saves edited registration field values, stamped with the semester derived from `collectionPath`.
   *
   * Takes only the fields the edit form actually owns and merges them in, rather
   * than a full registration object - the edit dialog loads `values` once when it
   * opens and can go stale relative to concurrent writes (e.g. a backfill script,
   * the parent saving their own form in the portal, or another admin action).
   * A full `setDoc()` from that stale snapshot would silently revert whatever
   * those writers changed; merging only the edited fields can't.
   */
  async saveRegistration(
    collectionPath: string,
    registrationId: string,
    editedFields: RegistrationEditableFields,
  ): Promise<void> {
    await setDoc(
      doc(db, collectionPath, registrationId),
      withSemester(
        editedFields,
        semesterIdFromPath(collectionPath) ?? currentSemester,
      ),
      { merge: true },
    )
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
