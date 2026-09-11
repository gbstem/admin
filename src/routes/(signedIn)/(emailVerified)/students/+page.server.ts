import { studentService } from '$lib/server/studentService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:registrations')
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        registrations: await studentService.fetchStudents({
          filter: url.searchParams.get('filter'),
          course: url.searchParams.get('course'),
          limit: limitVal,
          offset: offsetVal,
        }),
        page: pageNum,
        limit: limitVal,
      }
    } catch (err: any) {
      console.error('[Load Error] students page load:', err)
      throw error(500, {
        message:
          'Something went wrong while fetching students. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    try {
      return {
        query,
        registrations: await studentService.searchStudents(query),
      }
    } catch (err: any) {
      console.error('[Search Error] students search load:', err)
      throw error(500, {
        message: 'The search failed. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad
