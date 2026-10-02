import { resolveSemester } from '$lib/data/collections'
import { error } from '@sveltejs/kit'

/**
 * The document an edit-form action writes, from its `&id=` and `&semester=`
 * parameters.
 *
 * Refuses rather than repairs a bad target. `resolveSemester` falls back to
 * the current semester for an unknown id, which is right for browsing but
 * would send a write meant for one semester to another. A document id may
 * not contain `/`, or it would address a different path.
 */
export function editTarget(url: URL): { id: string; semesterId: string } {
  const id = url.searchParams.get('id') ?? ''
  const semesterId = url.searchParams.get('semester') ?? ''
  if (!id || id.includes('/') || id === '.' || id === '..') {
    error(400, 'Choose a document to edit.')
  }
  if (resolveSemester(semesterId) !== semesterId) {
    error(400, `Unknown semester: ${semesterId}`)
  }
  return { id, semesterId }
}
