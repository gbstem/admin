import {
  checkAdminAccountDeletionEligibility,
  deleteAdminAccount,
} from '$lib/server/accountService'
import { handleApiError, verifyAuthenticated } from '$lib/server/apiHelpers'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/** Pre-flight check for the "Delete account" button - see DELETE below. */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    const result = await checkAdminAccountDeletionEligibility(user.uid)
    return json(result)
  } catch (err) {
    throw handleApiError('/api/account', err)
  }
}

/**
 * Deletes the caller's own account: their `users` document, any interview
 * slots they own with nobody booked, and their Auth account - see
 * `deleteAdminAccount`. Refused (409) with a reason when a future scheduled
 * interview would be orphaned; this re-checks the same rule the GET above
 * reports, rather than trusting that earlier result.
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    await deleteAdminAccount(user.uid)
    return json({ deleted: true })
  } catch (err) {
    throw handleApiError('/api/account', err)
  }
}
