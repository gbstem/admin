import {
  CREATE_TOKEN_FORM_ID,
  tokenSchema,
} from '#lib/components/forms/schemas.js'
import { verifyAdmin } from '#lib/server/apiHelpers.js'
import { error, fail } from '@sveltejs/kit'
import { superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'
import { tokenService } from '#lib/server/tokenService.js'

import { parsePagination } from '#lib/utils.js'

export const load = (async ({ depends, locals, url }) => {
  if (locals.user && locals.user.role === 'admin') {
    depends('app:tokens')
    const { pageNum, limitVal, offsetVal } = parsePagination(url)
    try {
      return {
        tokens: await tokenService.fetchTokens({
          limit: limitVal,
          offset: offsetVal,
        }),
        page: pageNum,
        limit: limitVal,
      }
    } catch (err: any) {
      console.error('[Load Error] tokens page load:', err)
      throw error(
        500,
        'Something went wrong while fetching tokens. Please try again later.',
        {
          details: err.message || err.toString(),
          code: err.code || 'UNKNOWN',
        },
      )
    }
  } else {
    throw error(400, 'You do not have permission to view this page.')
  }
}) satisfies PageServerLoad

export const actions: Actions = {
  /**
   * CreateTokenForm's save. Admins only: a token grants whoever holds it an
   * admin or reviewer account. Returns the new token's id for the signup
   * link.
   */
  createToken: async ({ request, locals }) => {
    verifyAdmin(locals)
    const form = await superValidate(request, zod(tokenSchema), {
      id: CREATE_TOKEN_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    return { form, tokenId: await tokenService.createToken(form.data) }
  },
}
