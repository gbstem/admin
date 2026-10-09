import { clearSentEmails, getSentEmails } from '#lib/server/email.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

function assertTestEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw error(403, 'Test endpoint unavailable in production.')
  }
}

export const GET: RequestHandler = async () => {
  assertTestEnvironment()
  return Response.json(getSentEmails())
}

export const DELETE: RequestHandler = async () => {
  assertTestEnvironment()
  clearSentEmails()
  return Response.json({ message: 'Sent emails cleared.' })
}
