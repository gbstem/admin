import { db } from '#lib/client/firebase.js'
import { deserialize } from '$app/forms'
import { currentSemester, semesterIdFromPath } from '#lib/data/collections.js'
import { doc, getDoc } from 'firebase/firestore'

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
   * Sets a registration's `agreements.bypassAgeLimits` through the
   * `/registrations?/setBypassAgeLimits` action, in the semester
   * `collectionPath` belongs to. Throws an `HttpError`-shaped `{ status,
   * message }` when the action refuses.
   */
  async setBypassAgeLimits(
    collectionPath: string,
    registrationId: string,
    bypassAgeLimits: boolean,
  ): Promise<void> {
    const semesterId = semesterIdFromPath(collectionPath) ?? currentSemester
    const body = new FormData()
    body.set('bypassAgeLimits', String(bypassAgeLimits))
    const res = await fetch(
      `/registrations?/setBypassAgeLimits&id=${encodeURIComponent(registrationId)}&semester=${semesterId}`,
      { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } },
    )
    const result = deserialize(await res.text())
    if (result.type === 'error') {
      throw {
        status: result.status ?? res.status,
        message: result.error?.message ?? 'Request failed.',
      }
    }
    if (result.type !== 'success') {
      throw { status: res.status, message: 'Request failed.' }
    }
  },
}
