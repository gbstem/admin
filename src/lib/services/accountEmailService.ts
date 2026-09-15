import type {
  ResolveEmailsRequestBody,
  ResolveEmailsResponse,
} from '../../routes/api/resolveEmails/+server'

/**
 * The one client call behind every uid-to-address lookup. Components don't
 * call this directly: the service that owns a view's data wraps it in a
 * task-named function (`fetchClassInstructorEmail` and the like), so each
 * intent's request is built in one place. Kept byte-identical in admin and
 * portal.
 */
export const accountEmailService = {
  /**
   * Resolves `request.uids` to current addresses, null for any that name no
   * account. Throws with the server's message if the request is refused or
   * fails - never an empty result, which a view would show as "no address".
   */
  async resolveEmails(
    request: ResolveEmailsRequestBody,
  ): Promise<ResolveEmailsResponse['emails']> {
    const res = await fetch('/api/resolveEmails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(
        errData?.message || `Could not look up email addresses (${res.status})`,
      )
    }
    const { emails } = (await res.json()) as ResolveEmailsResponse
    return emails
  },
}
