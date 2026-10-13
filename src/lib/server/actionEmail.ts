import { renderEmail } from '#lib/emails/render.js'
import { sendEmail } from '#lib/server/email.js'

/**
 * Sends an account action email - a Firebase verification or password reset
 * link behind a single button - for `/api/verifyEmail` and
 * `/api/resetPassword`.
 *
 * Answers the request either way: a send that fails is a 500 with a message
 * the form can show, not a throw, so the caller isn't left trusting an email
 * that never went out.
 */
export async function respondWithActionEmail(
  to: string,
  subject: string,
  action: { link: string; name: string; description: string },
): Promise<Response> {
  const html = renderEmail('actionEmailTemplate', {
    subject,
    action,
    app: {
      name: 'Admin',
      link: 'https://admin.gbstem.org',
    },
  })
  try {
    await sendEmail({ to, subject, html })
  } catch {
    return Response.json(
      { error: 'Failed to send email. Please try again later.' },
      { status: 500 },
    )
  }
  return Response.json({ message: 'Email sent successfully.' })
}
