import { redirect } from '@sveltejs/kit'
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks'
import { adminAuth } from '#lib/server/firebase.js'

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
    throw redirect(303, 'https://portal.gbstem.org', { external: true })
  }
  return resolve(event)
}) satisfies Handle

/**
 * Shapes an *unexpected* error - anything not thrown with `error()` - for the
 * client, and logs it under an id the response carries for reporting it.
 *
 * Signed-in users (admins and reviewers, whom `handle` above has verified)
 * also get the raw message, code and stack: they are trusted, and often the
 * developers of this site. Anyone else gets only the id, leaving SvelteKit's
 * own status and message ("Internal Error") in place. Never send the stack to
 * them: unauthenticated callers reach this (a malformed POST to /api/auth is
 * enough), and it exposes server paths, bundle layout and dependency details.
 *
 * Errors thrown with `error()` (kind `app`) and SvelteKit's own, such as a
 * 404 (kind `framework`), already carry a message meant for the client, so
 * they pass through unchanged and unlogged.
 */
export const handleError = (({ kind, error, event }) => {
  if (kind !== 'unknown') return
  const errorId = crypto.randomUUID()
  console.error(`[SvelteKit Server Error ${errorId}]:`, error)
  if (!event.locals?.user) {
    return { errorId }
  }
  const message = (error as any)?.message
  return {
    ...(message && { message }),
    errorId,
    code: (error as any)?.code || 'INTERNAL_ERROR',
    details: (error as any)?.stack || String(error),
  }
}) satisfies HandleServerError
