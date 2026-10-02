import {
  EDIT_REGISTRATION_FORM_ID,
  registrationSchema,
} from '$lib/components/forms/schemas'
import { resolveSemester } from '$lib/data/collections'
import { verifyAdmin } from '$lib/server/apiHelpers'
import { editTarget } from '$lib/server/editTarget'
import { registrationService } from '$lib/server/registrationService'
import { parsePagination } from '$lib/utils'
import { error, fail } from '@sveltejs/kit'
import { message, superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'

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

export const actions: Actions = {
  /**
   * EditRegistrationForm's save, for `?/saveRegistration&id=…&semester=…`.
   * Admins only: reviewers can read registrations but, as in
   * firestore.rules, not change them.
   */
  saveRegistration: async ({ request, locals, url }) => {
    verifyAdmin(locals)
    const { id, semesterId } = editTarget(url)
    const form = await superValidate(request, zod(registrationSchema), {
      id: EDIT_REGISTRATION_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    await registrationService.saveRegistrationEdits(semesterId, id, form.data)
    return message(form, 'Changes were saved successfully.')
  },
}
