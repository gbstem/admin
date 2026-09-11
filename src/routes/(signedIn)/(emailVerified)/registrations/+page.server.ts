import { resolveSemester } from '$lib/data/collections'
import { registrationService } from '$lib/server/registrationService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:registrations')
  const semesterId = resolveSemester(url.searchParams.get('semester'))
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        registrations: await registrationService.fetchRegistrations({
          semesterId,
          filter: url.searchParams.get('filter'),
          limit: limitVal,
          offset: offsetVal,
        }),
        page: pageNum,
        limit: limitVal,
      }
    } catch (err: any) {
      console.error('[Load Error] registrations page load:', err)
      throw error(500, {
        message:
          'Something went wrong while fetching registrations. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    try {
      return {
        query,
        registrations: await registrationService.searchRegistrations(
          semesterId,
          query,
        ),
      }
    } catch (err: any) {
      console.error('[Search Error] registrations search load:', err)
      throw error(500, {
        message: 'The search failed. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad
