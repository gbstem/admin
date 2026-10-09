import { redirect } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'

export const load = (({ locals }) => {
  if (locals.user !== null) {
    throw redirect(303, '/dashboard')
  }
}) satisfies LayoutServerLoad
