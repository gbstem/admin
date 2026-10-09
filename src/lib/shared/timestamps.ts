// timestamps.ts - Turning a stored date into a `Date`. Kept byte-identical in
// admin and portal, and free of `#lib` and Firebase imports so server code,
// browser code, scripts and Cypress specs can all use it.
//
// A date read from Firestore arrives in several shapes depending on who read
// it: a `Timestamp` from either SDK (which has `toDate()`), that timestamp
// after a trip through JSON or a search index (`{ seconds, nanoseconds }`, or
// `{ _seconds, _nanoseconds }` from the Admin SDK), an ISO string from an API
// response, or already a `Date`. Convert through the functions here rather
// than writing another `typeof value.toDate === 'function'` check inline.

/** Milliseconds for a timestamp that has lost its methods, or null. */
function serializedTimestampMillis(value: object): number | null {
  const { seconds, _seconds, nanoseconds, _nanoseconds } = value as Record<
    string,
    unknown
  >
  const wholeSeconds = seconds ?? _seconds
  if (typeof wholeSeconds !== 'number') return null
  // `nanoseconds` matters: dropping it silently rounded every stored time
  // down to the whole second, so a meeting time moved by up to 999ms every
  // time its class was read and saved back. That went unnoticed because the
  // shift is invisible in the UI.
  const nanos = nanoseconds ?? _nanoseconds
  return (
    wholeSeconds * 1000 +
    (typeof nanos === 'number' ? Math.floor(nanos / 1e6) : 0)
  )
}

/**
 * A stored date as a `Date`, whatever shape it arrived in (see above). A
 * `Date` is returned as it is, not copied. A value that is none of those
 * shapes gives an Invalid Date, as `new Date(value)` would; use `toDateOrNull`
 * where the field may be missing.
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate()
    }
    const millis = serializedTimestampMillis(value)
    if (millis !== null) return new Date(millis)
  }
  return new Date(value as string | number)
}

/**
 * `toDate`, for a field that may be missing or malformed: null for `null`,
 * `undefined`, an empty string, or anything that isn't a date.
 */
export function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? null : date
}
