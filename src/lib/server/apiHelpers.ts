import { error, isHttpError } from '@sveltejs/kit'
import { ZodError } from 'zod'

/**
 * Ensures the user is signed in and has the admin role.
 * Throws a 401 if not signed in, 403 if not an admin, and 403 if their email
 * isn't verified (see `verifyAuthenticated`).
 */
export function verifyAdmin(locals: App.Locals) {
  const user = verifyAuthenticated(locals)
  if (user.role !== 'admin') {
    throw error(403, 'Unauthorized: Admin role required.')
  }
  return user
}

/**
 * Ensures the user is signed in and has either the admin or reviewer role.
 * Throws a 401 if not signed in, 403 if not an admin or reviewer, and 403 if
 * their email isn't verified (see `verifyAuthenticated`).
 */
export function verifyAdminOrReviewer(locals: App.Locals) {
  const user = verifyAuthenticated(locals)
  if (user.role !== 'admin' && user.role !== 'reviewer') {
    throw error(403, 'Unauthorized: Admin or Reviewer role required.')
  }
  return user
}

/**
 * Ensures the user is signed in (authenticated) *and* has a verified email.
 * Throws a 401 if not signed in, or a 403 if the address is unverified.
 *
 * The verified check lives here, not only in the `(emailVerified)` layout,
 * because a layout redirect protects neither an /api/* route nor a form
 * action. Accounts idle for too long have `emailVerified` reset, and
 * `firestore.rules` refuses their reads the same way - this is the half of
 * that which the Admin SDK's rules bypass would otherwise leave open.
 *
 * Pass `allowUnverified` only for what an unverified person must still reach:
 * requesting the verification email itself, and managing their own account.
 */
export function verifyAuthenticated(
  locals: App.Locals,
  { allowUnverified = false }: { allowUnverified?: boolean } = {},
) {
  if (!locals.user) {
    throw error(401, 'User not signed in.')
  }
  if (!allowUnverified && !locals.user.emailVerified) {
    throw error(403, 'Verify your email address first.')
  }
  return locals.user
}

/**
 * Translates caught exceptions into SvelteKit HttpErrors.
 * Logs the error server-side with the API route context.
 * If the exception is already a SvelteKit error, it is rethrown as-is.
 */
export function handleApiError(route: string, err: unknown): never {
  console.error(`[API ${route} Error]:`, err)

  if (isHttpError(err)) {
    throw err
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')
    throw error(400, `Validation failed: ${formattedErrors}`)
  }

  if (typeof err === 'string') {
    throw error(400, err)
  }

  if (err instanceof Error) {
    throw error(400, err.message)
  }

  const typedErr = err as any
  if (typedErr && typeof typedErr === 'object') {
    if (
      'errorInfo' in typedErr &&
      typedErr.errorInfo &&
      'message' in typedErr.errorInfo
    ) {
      throw error(
        400,
        typedErr.errorInfo.message ||
          'Please wait a few minutes before trying again.',
      )
    }
    if ('message' in typedErr && typeof typedErr.message === 'string') {
      throw error(400, typedErr.message)
    }
  }

  throw error(400, 'Something went wrong. Please try again.')
}
