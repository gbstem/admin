import { recordNewAccount } from '$lib/server/accountService'
import { sendEmail } from '$lib/server/email'
import { adminAuth, verifyToken } from '$lib/server/firebase'
import { renderEmail } from '$lib/emails/render'
import { fail, redirect } from '@sveltejs/kit'
import type { FirebaseError } from 'firebase-admin'
import type { Actions, PageServerLoad } from './$types'

// Shared with the `default` action below: same states, same copy, whether the
// token fails on the initial GET (a stale link someone clicked) or on submit.
export function _tokenErrorMessage(
  state: 'consumed' | 'expired' | 'unknown',
): string {
  switch (state) {
    case 'consumed':
      return 'Token already consumed. If this token was meant specifically for your account, immediately contact an admin with this message.'
    case 'expired':
      return 'Token has expired. If you need a new token, contact an admin.'
    case 'unknown':
      return 'Something went wrong. Please try again.'
  }
}

export const load = (async ({ url }) => {
  const token = url.searchParams.get('token')
  if (token) {
    try {
      await verifyToken(token)
      return {
        token,
        tokenError: null,
      }
    } catch (err) {
      const state = err as 'consumed' | 'expired' | 'fake' | 'unknown'
      // A garbage/tampered token isn't something a real user with a stale
      // link produces, so it keeps the old silent bounce to signin. The other
      // three states are what a real user sees on an expired or already-used
      // registration link, so the page has to render *something* they can
      // read - throwing a SvelteKit `error()` here would skip the page (and
      // the notification banner in the root layout) entirely in favor of the
      // generic error boundary, which is exactly the "broken error
      // reporting" from the production report this fixes.
      if (state === 'fake') {
        throw redirect(301, '/signin')
      }
      return {
        token: null,
        tokenError: _tokenErrorMessage(state),
      }
    }
  }
  throw redirect(301, '/signin')
}) satisfies PageServerLoad

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData()
    const values = {
      email: formData.get('email') as string,
      firstName: (formData.get('first-name') as string).trim(),
      lastName: (formData.get('last-name') as string).trim(),
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirm-password') as string,
    }
    const token = formData.get('token') as string
    try {
      const { role } = await verifyToken(token)
      let uid: string
      try {
        ;({ uid } = await adminAuth.createUser({
          email: values.email,
          password: values.password,
          displayName: `${values.firstName} ${values.lastName}`,
        }))
      } catch (err) {
        return fail(400, {
          error: (err as FirebaseError).message,
        })
      }
      // Everything past account creation shares one rollback: a half-created
      // account is worse than no account. Mirrors portal's signup, which also
      // writes the `users` document so both sites produce identical records.
      try {
        await adminAuth.setCustomUserClaims(uid, { role })
        await recordNewAccount({
          uid,
          token,
          role,
          firstName: values.firstName,
          lastName: values.lastName,
        })
      } catch (err) {
        console.error('Signup error, rolling back account:', err)
        await adminAuth
          .deleteUser(uid)
          .catch((delErr) =>
            console.error('Error rolling back auth user:', delErr),
          )
        // Somebody else's signup used the token between the check above and
        // this one; say so, rather than suggesting a retry that can't work.
        if (err === 'consumed' || err === 'expired') {
          return fail(400, { error: _tokenErrorMessage(err) })
        }
        return fail(400, {
          error: 'Account setup failed. Please try again.',
        })
      }
      // Deliberately non-fatal: a mail hiccup must not destroy an otherwise
      // good account. The user can request a new verification email later,
      // but the `emailWarning` flag lets the client tell them the first one
      // never went out, since a silent failure leaves them trusting an email
      // that was never sent.
      try {
        const link = await adminAuth.generateEmailVerificationLink(values.email)
        const template = {
          name: 'action',
          data: {
            subject: 'Verify Email for gbSTEM Account',
            action: {
              link,
              name: 'Verify Email',
              description:
                'Please verify your email for your gbSTEM account by clicking the button below.',
            },
            app: {
              name: 'Admin',
              link: 'https://admin.gbstem.org',
            },
          },
        }

        const htmlBody = renderEmail('actionEmailTemplate', template.data)

        await sendEmail({
          to: values.email,
          subject: template.data.subject,
          html: htmlBody,
        })
      } catch (err) {
        console.error('Signup verification email error:', err)
        return { success: true, emailWarning: true }
      }
      return { success: true }
    } catch (err) {
      const state = err as 'consumed' | 'expired' | 'fake' | 'unknown'
      return fail(400, {
        error: _tokenErrorMessage(state === 'fake' ? 'unknown' : state),
      })
    }
  },
} satisfies Actions
