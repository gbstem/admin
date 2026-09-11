import { instructorFeedbackService } from '$lib/server/instructorFeedbackService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    throw error(403, 'You do not have permission to view this page.')
  }
  depends('app:instructorFeedback')
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        page: pageNum,
        limit: limitVal,
        feedback: await instructorFeedbackService.fetchInstructorFeedback({
          course: url.searchParams.get('course'),
          limit: limitVal,
          offset: offsetVal,
        }),
      }
    } catch (err: any) {
      console.error('[Load Error] instructor-feedback page load:', err)
      throw error(500, {
        message:
          'Something went wrong while fetching instructor feedback. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  } else {
    try {
      return {
        query,
        feedback:
          await instructorFeedbackService.searchInstructorFeedback(query),
      }
    } catch (err: any) {
      console.error('[Search Error] instructor-feedback search load:', err)
      throw error(500, {
        message: 'The search failed. Please try again later.',
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad
