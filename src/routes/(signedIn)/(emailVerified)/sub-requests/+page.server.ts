import { subRequestService } from '$lib/server/subRequestService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:subRequests')
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        page: pageNum,
        limit: limitVal,
        subRequests: await subRequestService.fetchSubRequests({
          course: url.searchParams.get('course'),
          limit: limitVal,
          offset: offsetVal,
        }),
      }
    } catch (err: any) {
      console.error('[Load Error] sub-requests page load:', err)
      throw error(500, {
        message:
          'Something went wrong while fetching sub requests. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    try {
      return {
        query,
        subRequests: await subRequestService.searchSubRequests(query),
      }
    } catch (err: any) {
      console.error('[Search Error] sub-requests search load:', err)
      throw error(500, {
        message: 'The search failed. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad
