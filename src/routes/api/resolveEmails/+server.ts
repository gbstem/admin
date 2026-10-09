import { resolveAccountEmails } from '#lib/server/accountEmails.js'
import { handleApiError, verifyAuthenticated } from '#lib/server/apiHelpers.js'
import {
  authorizeEmailResolution,
  resolveEmailsSchema,
} from '#lib/server/emailIntents.js'
import type { RequestHandler } from './$types'

export type { ResolveEmailsRequestBody } from '#lib/server/emailIntents.js'

export interface ResolveEmailsResponse {
  /** Every requested uid; null where it names no Auth account with an email. */
  emails: Record<string, string | null>
}

/**
 * Resolves account uids to their current email addresses, for views that show
 * another person's address. Stored copies go stale when their owner changes
 * their account email, so these views look the address up by uid instead.
 *
 * What a caller may resolve depends on the request's intent and context, and
 * is decided in `#lib/server/emailIntents.js` - see there to add a use case. A
 * refused request is refused whole, with no addresses. Kept byte-identical in
 * admin and portal.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyAuthenticated(locals)
    const body = resolveEmailsSchema.parse(await request.json())
    await authorizeEmailResolution(caller, body)

    const found = await resolveAccountEmails(body.uids)
    const response: ResolveEmailsResponse = {
      emails: Object.fromEntries(
        body.uids.map((uid) => [uid, found.get(uid) ?? null]),
      ),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/resolveEmails', err)
  }
}
