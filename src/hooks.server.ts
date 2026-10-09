import { adminAuth } from '$lib/server/firebase'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'

export const handle = (async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('__session')
  let shouldRedirectToPortal = false
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie!,
      true,
    )
    const userRecord = await adminAuth.getUser(decodedClaims.uid)
    if (
      userRecord.customClaims &&
      'role' in userRecord.customClaims &&
      (userRecord.customClaims.role === 'admin' ||
        userRecord.customClaims.role === 'reviewer')
    ) {
      const { role } = userRecord.customClaims as { role: Data.Role }
      event.locals.user = {
        uid: userRecord.uid,
        email: userRecord.email as string,
        emailVerified: userRecord.emailVerified,
        role,
      }
    } else {
      event.locals.user = null
      shouldRedirectToPortal = true
    }
  } catch (err) {
    event.locals.user = null
  }
  // `redirect()` throws immediately, so it must be called outside the try
  // block above - otherwise the throw is caught by the surrounding
  // catch(err), which just resets locals.user and silently drops the
  // redirect instead of letting it propagate.
  if (shouldRedirectToPortal) {
    throw redirect(303, 'https://portal.gbstem.org')
  }
  return resolve(event)
}) satisfies Handle

/**
 * Shapes an *unexpected* error - anything not thrown with `error()` - for the
 * client, and logs it under an id the response carries for reporting it.
 *
 * Signed-in users (admins and reviewers, whom `handle` above has verified)
 * also get the raw message, code and stack: they are trusted, and often the
 * developers of this site. Anyone else gets only SvelteKit's generic
 * `message` ("Internal Error", "Not Found") and the id. This used to return
 * the stack to any caller at all (a malformed POST to /api/auth was enough),
 * which exposed server paths, bundle layout and dependency details.
 */
export const handleError = (({ error, event, status, message }) => {
  const errorId = crypto.randomUUID()
  if (status !== 404) {
    console.error(`[SvelteKit Server Error ${errorId}]:`, error)
  }
  if (!event.locals?.user) {
    return { message, errorId }
  }
  return {
    message: (error as any)?.message || message,
    errorId,
    code: (error as any)?.code || 'INTERNAL_ERROR',
    details: (error as any)?.stack || String(error),
  }
}) satisfies HandleServerError
