import { resolveSemester } from '$lib/data/collections'
import { applicationService } from '$lib/server/applicationService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:applications')
  const semesterId = resolveSemester(url.searchParams.get('semester'))
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        applications: await applicationService.fetchApplications({
          semesterId,
          filter: url.searchParams.get('filter'),
          limit: limitVal,
          offset: offsetVal,
        }),
        page: pageNum,
        limit: limitVal,
      }
    } catch (err: any) {
      console.error('[Load Error] applications page load:', err)
      throw error(500, {
        message:
          'Something went wrong while fetching applications. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    try {
      return {
        query,
        applications: await applicationService.searchApplications(
          semesterId,
          query,
        ),
      }
    } catch (err: any) {
      console.error('[Search Error] applications search load:', err)
      throw error(500, {
        message: 'The search failed. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad
