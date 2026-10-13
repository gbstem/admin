import { respondWithActionEmail } from '#lib/server/actionEmail.js'
import { handleApiError, verifyAuthenticated } from '#lib/server/apiHelpers.js'
import { adminAuth } from '#lib/server/firebase.js'
import type { RequestHandler } from './$types'

/**
 * Emails the signed-in caller a link to verify their own address. Takes no
 * body: the address comes off the session, so nobody can aim this at an inbox
 * other than their own.
 */
export const POST: RequestHandler = async ({ locals }) => {
  try {
    // The one action an unverified person needs.
    const { email } = verifyAuthenticated(locals, { allowUnverified: true })
    const link = await adminAuth.generateEmailVerificationLink(email)
    return await respondWithActionEmail(
      email,
      'Verify Email for gbSTEM Account',
      {
        link,
        name: 'Verify Email',
        description:
          'Please verify your email for your gbSTEM account by clicking the button below.',
      },
    )
  } catch (err) {
    throw handleApiError('/api/verifyEmail', err)
  }
}
