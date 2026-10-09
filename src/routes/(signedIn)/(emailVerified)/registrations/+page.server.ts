import {
  EDIT_REGISTRATION_FORM_ID,
  registrationSchema,
} from '#lib/components/forms/schemas.js'
import { resolveSemester } from '#lib/data/collections.js'
import { verifyAdmin } from '#lib/server/apiHelpers.js'
import { editTarget } from '#lib/server/editTarget.js'
import { registrationService } from '#lib/server/registrationService.js'
import { parsePagination } from '#lib/utils.js'
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
      throw error(
        500,
        'Something went wrong while fetching registrations. Please try again later.',
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
        registrations: await registrationService.searchRegistrations(
          semesterId,
          query,
        ),
      }
    } catch (err: any) {
      console.error('[Search Error] registrations search load:', err)
      throw error(500, 'The search failed. Please try again later.', {
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
  /**
   * The registrations table's "Bypass Age Limits?" checkbox, for
   * `?/setBypassAgeLimits&id=…&semester=…` with a `bypassAgeLimits` field of
   * `true` or `false`. Admins only, like the edit form.
   */
  setBypassAgeLimits: async ({ request, locals, url }) => {
    verifyAdmin(locals)
    const { id, semesterId } = editTarget(url)
    const value = (await request.formData()).get('bypassAgeLimits')
    if (value !== 'true' && value !== 'false') {
      error(400, 'bypassAgeLimits must be true or false.')
    }
    await registrationService.setBypassAgeLimits(
      semesterId,
      id,
      value === 'true',
    )
    return { bypassAgeLimits: value === 'true' }
  },
}
