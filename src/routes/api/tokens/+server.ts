import { handleApiError, verifyAdmin } from '#lib/server/apiHelpers.js'
import { isDocId } from '#lib/server/editTarget.js'
import { tokenService } from '#lib/server/tokenService.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

/** One Firestore batch. */
const MAX_TOKENS = 500

const tokenIdsSchema = z.object({
  tokenIds: z
    .array(z.string().refine(isDocId, { message: 'Not a token id' }))
    .min(1, 'Choose a token.')
    .max(MAX_TOKENS),
})

export type TokenIdsRequestBody = z.infer<typeof tokenIdsSchema>

/**
 * Revokes signup tokens, all or none, recording the caller as the revoker.
 * Admins only, like the tokens page. Creating one is the
 * `/tokens?/createToken` form action.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    const admin = verifyAdmin(locals)
    const { tokenIds } = tokenIdsSchema.parse(await request.json())
    await tokenService.revokeTokens(tokenIds, admin.uid)
    return Response.json({ success: true })
  } catch (err) {
    throw handleApiError('/api/tokens', err)
  }
}

/**
 * Deletes signup tokens nobody has used, all or none: a 409 if any has
 * consumers, since those have to be revoked to keep their history. Admins
 * only.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const { tokenIds } = tokenIdsSchema.parse(await request.json())
    await tokenService.deleteTokens(tokenIds)
    return Response.json({ success: true })
  } catch (err) {
    throw handleApiError('/api/tokens', err)
  }
}
