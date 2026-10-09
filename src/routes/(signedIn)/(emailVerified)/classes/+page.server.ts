import {
  EDIT_CLASS_FORM_ID,
  editClassFormSchema,
} from '#lib/components/forms/schemas.js'
import { verifyAdminOrReviewer } from '#lib/server/apiHelpers.js'
import { classService } from '#lib/server/classService.js'
import { editTarget } from '#lib/server/editTarget.js'
import { parsePagination } from '#lib/utils.js'
import { error, fail } from '@sveltejs/kit'
import { message, superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:classes')
  const query = url.searchParams.get('query')
  if (query === null || query === '') {
    const { pageNum, limitVal, offsetVal } = parsePagination(url)

    try {
      return {
        classes: await classService.fetchClasses({
          filter: url.searchParams.get('filter'),
          limit: limitVal,
          offset: offsetVal,
        }),
        page: pageNum,
        limit: limitVal,
      }
    } catch (err: any) {
      console.error('[Load Error] classes page load:', err)
      throw error(
        500,
        'Something went wrong while fetching classes. Please try again later.',
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
        classes: await classService.searchClasses(query),
      }
    } catch (err: any) {
      console.error('[Search Error] classes search load:', err)
      throw error(500, 'The search failed. Please try again later.', {
        details: err.message || err.toString(),
        code: err.code || 'UNKNOWN',
      })
    }
  }
}) satisfies PageServerLoad

export const actions: Actions = {
  /**
   * EditClassForm's save, for `?/saveClass&id=…&semester=…`. Admins and
   * reviewers both manage classes.
   */
  saveClass: async ({ request, locals, url }) => {
    verifyAdminOrReviewer(locals)
    const { id, semesterId } = editTarget(url)
    const form = await superValidate(request, zod(editClassFormSchema), {
      id: EDIT_CLASS_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    await classService.saveClassEdits(semesterId, id, form.data)
    return message(form, 'Changes were saved successfully.')
  },
}
