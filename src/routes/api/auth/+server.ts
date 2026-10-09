import { adminAuth } from '#lib/server/firebase.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

import { z } from 'zod'

const authSchema = z.object({
  idToken: z.string().min(1, 'ID Token is required'),
})

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { idToken } = authSchema.parse(await request.json())
  const expiresIn = 1000 * 60 * 60 * 24 * 7
  const decodedIdToken = await adminAuth.verifyIdToken(idToken)

  const userRecord = await adminAuth.getUser(decodedIdToken.uid)
  const role = userRecord.customClaims?.role as string | undefined
  if (role !== 'admin' && role !== 'reviewer') {
    throw error(
      403,
      'Unauthorized: You do not have permission to access the admin site.',
    )
  }

  if (new Date().getTime() / 1000 - decodedIdToken.auth_time < 5 * 60) {
    const cookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    })
    // cookies.set()'s option is maxAge (seconds), not expiresIn (ms, the
    // Firebase Admin SDK option used above for the session cookie itself) -
    // the mismatched key was silently dropped, so the browser treated this
    // as a session cookie and the intended 7-day persistence never applied.
    const options = {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: true,
      path: '/',
    }
    cookies.set('__session', cookie, options)
    return Response.json({ status: 'signedIn' })
  } else {
    throw error(401, 'Recent sign in required.')
  }
}

export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete('__session', { path: '/' })
  return Response.json({ status: 'signedOut' })
}
