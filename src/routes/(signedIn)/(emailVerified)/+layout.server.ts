import { redirect } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'

export const load = (async ({ parent, locals }) => {
  await parent()
  if (!locals.user?.emailVerified) {
    throw redirect(303, '/profile')
  }
}) satisfies LayoutServerLoad
