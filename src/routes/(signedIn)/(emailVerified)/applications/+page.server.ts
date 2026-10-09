import {
  EDIT_APPLICATION_FORM_ID,
  applicationSchema,
} from '#lib/components/forms/schemas.js'
import { resolveSemester } from '#lib/data/collections.js'
import { verifyAdminOrReviewer } from '#lib/server/apiHelpers.js'
import { applicationService } from '#lib/server/applicationService.js'
import { editTarget } from '#lib/server/editTarget.js'
import { parsePagination } from '#lib/utils.js'
import { error, fail } from '@sveltejs/kit'
import { message, superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'

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
      throw error(
        500,
        'Something went wrong while fetching applications. Please try again later.',
        {
          details: err.message || err.toString(),
          code: err.code || 'UNKNOWN',
        },
      )
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
      throw error(500, 'The search failed. Please try again later.', {
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad

export const actions: Actions = {
  /**
   * EditApplicationForm's save, for `?/saveApplication&id=…&semester=…`.
   * Reviewers may edit applications too, as firestore.rules lets them.
   */
  saveApplication: async ({ request, locals, url }) => {
    verifyAdminOrReviewer(locals)
    const { id, semesterId } = editTarget(url)
    const form = await superValidate(request, zod(applicationSchema), {
      id: EDIT_APPLICATION_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    await applicationService.saveApplicationEdits(semesterId, id, form.data)
    return message(form, 'Changes were saved successfully.')
  },
}
