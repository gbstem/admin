import { respondWithActionEmail } from '#lib/server/actionEmail.js'
import { handleApiError } from '#lib/server/apiHelpers.js'
import { adminAuth } from '#lib/server/firebase.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export type ResetPasswordRequestBody = z.infer<typeof resetPasswordSchema>

/**
 * Emails a password reset link. This is the signed-out "forgot password"
 * page's route, so it takes the address from the caller - which means anyone
 * could use it to flood a user's inbox from our domain, and in doing so
 * exhaust Firebase Auth's project-wide quota, blocking these emails for
 * everyone.
 *
 * That is why it is a route of its own: it is rate limited outside this code,
 * by a Vercel WAF rule on this project (Vercel dashboard > Firewall >
 * Configure): POST /api/resetPassword, 5 requests per 10 minutes per IP,
 * answering 429. Real use is one request plus maybe a resend, and a whole
 * school network rarely needs resets at once, so the limit should never need
 * raising. The same rule exists on the other site's project. Keep signed-in
 * email routes such as /api/verifyEmail - which portal's signup calls for
 * every new account - out from under it.
 *
 * TODO(rate limiting): an in-process limiter (e.g. sveltekit-rate-limiter)
 * only works here with a shared store such as Redis - its default in-memory
 * store is per serverless instance on Vercel. If one is ever added, move this
 * limit into code so it is visible and tested.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = resetPasswordSchema.parse(await request.json())
    // A signed-in caller can only reset *their own* password - the
    // client-supplied email is otherwise how a logged-in attacker could target
    // any other account's inbox.
    const email = locals.user ? locals.user.email : body.email
    let link: string
    try {
      link = await adminAuth.generatePasswordResetLink(email)
    } catch (err) {
      // Answer exactly as if the email had gone out, so nobody signed out can
      // learn whether an address has a gbSTEM account. For an email lookup
      // Firebase reports `auth/email-not-found`; `auth/user-not-found` is
      // covered too so a change in which one it uses can't reopen this.
      const code = (err as { code?: string })?.code
      if (code === 'auth/email-not-found' || code === 'auth/user-not-found') {
        return Response.json({ message: 'Email sent successfully.' })
      }
      throw err
    }
    return await respondWithActionEmail(
      email,
      'Reset Password for gbSTEM Account',
      {
        link,
        name: 'Reset Password',
        description:
          'Please reset your password for your gbSTEM account by clicking the button below.',
      },
    )
  } catch (err) {
    throw handleApiError('/api/resetPassword', err)
  }
}
