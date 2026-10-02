import { resolveSemester } from '$lib/data/collections'
import { error } from '@sveltejs/kit'

/**
 * `semesterId` if it is a known semester, else a 400.
 *
 * Refuses rather than repairs: `resolveSemester` falls back to the current
 * semester for an unknown id, which is right for browsing but would send a
 * write meant for one semester to another.
 */
export function requireKnownSemester(semesterId: string): string {
  if (!semesterId || resolveSemester(semesterId) !== semesterId) {
    error(400, `Unknown semester: ${semesterId}`)
  }
  return semesterId
}

/** Whether `id` can name a single Firestore document: no `/`, not `.`/`..`. */
export function isDocId(id: string): boolean {
  return Boolean(id) && !id.includes('/') && id !== '.' && id !== '..'
}

/**
 * The document an edit-form action writes, from its `&id=` and `&semester=`
 * parameters. A document id may not contain `/`, or it would address a
 * different path.
 */
export function editTarget(url: URL): { id: string; semesterId: string } {
  const id = url.searchParams.get('id') ?? ''
  if (!isDocId(id)) {
    error(400, 'Choose a document to edit.')
  }
  return {
    id,
    semesterId: requireKnownSemester(url.searchParams.get('semester') ?? ''),
  }
}
