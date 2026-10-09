// apiErrors.ts - Reading the refusal of one of our own API routes. Kept
// byte-identical in admin and portal, and free of `#lib` imports.

/**
 * Why a `fetch` to one of our API routes failed, for showing to the person
 * who made it. SvelteKit's `error(status, message)` answers with a JSON body
 * of `{ message }`; a response without one (a proxy's HTML error page, an
 * empty body) gives `fallback` instead, which defaults to the status text.
 *
 * Reads the body, so call it only on a response nothing else will read:
 *
 *   if (!res.ok) throw new Error(await errorMessage(res, 'Could not save.'))
 */
export async function errorMessage(
  res: Response,
  fallback: string = res.statusText,
): Promise<string> {
  try {
    const body: unknown = await res.json()
    const message = (body as { message?: unknown } | null)?.message
    return typeof message === 'string' && message ? message : fallback
  } catch {
    return fallback
  }
}
