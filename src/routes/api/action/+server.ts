import { handleApiError, verifyAuthenticated } from '#lib/server/apiHelpers.js'
import { sendEmail } from '#lib/server/email.js'
import { adminAuth } from '#lib/server/firebase.js'
import { renderEmail } from '#lib/emails/render.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

import { z } from 'zod'

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('verifyEmail'),
  }),
  z.object({
    type: z.literal('resetPassword'),
    email: z.string().email('Invalid email address'),
  }),
])

export type ActionRequestBody = z.infer<typeof actionSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = actionSchema.parse(await request.json())
    let to = ''
    let data

    switch (body.type) {
      case 'verifyEmail': {
        // The one action an unverified person needs.
        const user = verifyAuthenticated(locals, { allowUnverified: true })
        const email = user.email
        const link = await adminAuth.generateEmailVerificationLink(email)
        to = email
        data = {
          subject: 'Verify Email for gbSTEM Account',
          action: {
            link,
            name: 'Verify Email',
            description:
              'Please verify your email for your gbSTEM account by clicking the button below.',
          },
        }
        break
      }
      case 'resetPassword': {
        // A signed-in caller can only reset *their own* password - the
        // client-supplied email is otherwise how a logged-in attacker could
        // target any other account's inbox. An anonymous caller (this
        // action's actual use: the signed-out /reset-password "forgot
        // password" page) has no session to take an email from, so it still
        // supplies one itself.
        const email = locals.user ? locals.user.email : body.email
        if (!email) {
          throw error(400, 'Email is required for password reset.')
        }
        let link: string
        try {
          link = await adminAuth.generatePasswordResetLink(email)
        } catch (err) {
          // Answer exactly as if the email had gone out. An error here used
          // to reach the caller as Firebase's "no user record" message, so
          // anyone, signed out, could learn whether an address has a gbSTEM
          // account. For an email lookup Firebase reports
          // `auth/email-not-found`; `auth/user-not-found` is covered too so a
          // change in which one it uses can't reopen this.
          const code = (err as { code?: string })?.code
          if (
            code === 'auth/email-not-found' ||
            code === 'auth/user-not-found'
          ) {
            return Response.json({ message: 'Email sent successfully.' })
          }
          throw err
        }
        to = email
        data = {
          subject: 'Reset Password for gbSTEM Account',
          action: {
            link,
            name: 'Reset Password',
            description:
              'Please reset your password for your gbSTEM account by clicking the button below.',
          },
        }
        break
      }
      default: {
        throw error(400, 'Invalid action type.')
      }
    }

    const template = {
      name: 'action',
      data: {
        ...data,
        app: {
          name: 'Admin',
          link: 'https://admin.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('actionEmailTemplate', template.data)

    try {
      await sendEmail({
        to: to,
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      return Response.json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return Response.json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/action', err)
  }
}
