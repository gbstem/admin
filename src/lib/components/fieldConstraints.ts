import { readable, type Readable } from 'svelte/store'

/**
 * The constraints store of a `superForm(...)` result, or an empty one for a
 * caller that passed something else.
 *
 * `superForm(...).constraints` is a store, not the constraints object. The
 * `Form*` wrappers used to walk it as an object, found nothing, and so never
 * picked up the schema's `required`, `maxlength`, `pattern`, ... - only fields
 * given an explicit `required` prop were ever marked required.
 */
export function constraintsStore(form: any): Readable<unknown> {
  const store = form?.constraints
  return store && typeof store.subscribe === 'function'
    ? store
    : readable(undefined)
}

/**
 * One field's constraints (`required`, `maxlength`, `pattern`, ...) from a
 * superforms constraints object, by dotted path such as
 * `'essay.academicBackground'`. `{}` when the path isn't there.
 */
export function constraintAt(
  constraints: unknown,
  path: string,
): Record<string, any> {
  if (!constraints || !path) return {}
  let current: any = constraints
  for (const part of path.split('.')) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return {}
    }
  }
  return current && typeof current === 'object' ? current : {}
}
