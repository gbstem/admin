import { adminAuth } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'

/**
 * Resolves an account's current email from Auth by uid, for the notification
 * endpoints that mail someone other than the caller.
 *
 * There is deliberately no fallback to a stored or client-supplied address. A
 * stored one goes stale the moment its owner changes their account email, and
 * one taken from the request lets the caller choose who gets official gbSTEM
 * mail. A uid that names no Auth account, or an account with no email, is a
 * 400: the document behind the request needs fixing, not guessing around. See
 * notes/EMAIL_TO_UID_AUDIT.md section 7, Phase 4.
 *
 * `who` names the person in the error message ("Interviewer", "Applicant").
 */
export async function resolveAccountEmail(
  uid: string,
  who: string,
  route: string,
): Promise<string> {
  try {
    const user = await adminAuth.getUser(uid)
    if (user.email) return user.email
    console.error(
      `[API ${route}] ${who} uid ${uid} has no email on its Auth account`,
    )
  } catch (err) {
    console.error(
      `[API ${route}] ${who} uid ${uid} could not be resolved from Auth:`,
      err,
    )
  }
  throw error(400, `${who} email could not be resolved`)
}
