import { env } from '$env/dynamic/private'
import { handleApiError } from '$lib/server/apiHelpers'
import { resetIdleVerification } from '$lib/server/idleAccounts'
import { error, json } from '@sveltejs/kit'
import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from './$types'

// A first run may reset many accounts at once.
export const config = { maxDuration: 60 }

/** Whether `header` is exactly `Bearer <CRON_SECRET>`, compared in constant time. */
function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Weekly Vercel cron (see vercel.json): resets email verification on
 * accounts that have been idle too long - see `resetIdleVerification`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` with each invocation. No
 * session is involved, so this is the only gate: with CRON_SECRET unset the
 * route refuses everyone rather than running open. `?dryRun=1` reports who
 * would be reset without changing anyone.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  try {
    const secret = env.CRON_SECRET
    if (!secret) {
      throw error(500, 'CRON_SECRET is not configured.')
    }
    if (!isAuthorized(request.headers.get('authorization'), secret)) {
      throw error(401, 'Unauthorized.')
    }
    const summary = await resetIdleVerification({
      dryRun: url.searchParams.get('dryRun') === '1',
    })
    return json(summary)
  } catch (err) {
    throw handleApiError('/api/cron/resetIdleVerification', err)
  }
}
