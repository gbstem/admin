import type {
  ResolveEmailsRequestBody,
  ResolveEmailsResponse,
} from '../../routes/api/resolveEmails/+server'

/** The most documents one /api/resolveEmails request may name. */
const DOCUMENTS_PER_REQUEST = 500

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

  /**
   * For a list view: the current address of the account behind each of
   * `documents`, keyed by document id. A document with no uid, or whose
   * account is gone, is absent. `buildRequest` names the intent and context
   * for one batch of documents; a long list is split into as many requests
   * as the endpoint's per-request limit needs.
   */
  async resolveEmailsByDocument(
    documents: { id: string; uid: string }[],
    buildRequest: (batch: {
      ids: string[]
      uids: string[]
    }) => ResolveEmailsRequestBody,
  ): Promise<Record<string, string>> {
    const identified = documents.filter((document) => document.uid)
    const batches: (typeof identified)[] = []
    for (let i = 0; i < identified.length; i += DOCUMENTS_PER_REQUEST) {
      batches.push(identified.slice(i, i + DOCUMENTS_PER_REQUEST))
    }

    const byDocument: Record<string, string> = {}
    await Promise.all(
      batches.map(async (batch) => {
        const emails = await accountEmailService.resolveEmails(
          buildRequest({
            ids: batch.map((document) => document.id),
            uids: [...new Set(batch.map((document) => document.uid))],
          }),
        )
        for (const document of batch) {
          const email = emails[document.uid]
          if (email) byDocument[document.id] = email
        }
      }),
    )
    return byDocument
  },
}
