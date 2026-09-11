import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { tokenService } from '$lib/server/tokenService'

import { parsePagination } from '$lib/utils'

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
      throw error(500, {
        message:
          'Something went wrong while fetching tokens. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    throw error(400, 'You do not have permission to view this page.')
  }
}) satisfies PageServerLoad
