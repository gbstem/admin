import { handleApiError, verifyAdmin } from '$lib/server/apiHelpers'
import { isDocId } from '$lib/server/editTarget'
import { tokenService } from '$lib/server/tokenService'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

/** One Firestore batch. */
const MAX_TOKENS = 500

const deleteTokensSchema = z.object({
  tokenIds: z
    .array(z.string().refine(isDocId, { message: 'Not a token id' }))
    .min(1, 'Choose a token to delete.')
    .max(MAX_TOKENS),
})

export type DeleteTokensRequestBody = z.infer<typeof deleteTokensSchema>

/**
 * Deletes signup tokens, all or none. Admins only, like the tokens page.
 * Creating one is the `/tokens?/createToken` form action.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const { tokenIds } = deleteTokensSchema.parse(await request.json())
    await tokenService.deleteTokens(tokenIds)
    return json({ success: true })
  } catch (err) {
    throw handleApiError('/api/tokens', err)
  }
}
