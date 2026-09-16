import { registrationParentUid } from '$lib/data/docIds'
import { adminAuth } from '$lib/server/firebase'

/** `auth.getUsers()` accepts at most this many identifiers per call. */
const AUTH_LOOKUP_LIMIT = 100

/**
 * Looks up the current email address of every account in `uids`: one batched
 * Auth call per hundred uids, made in parallel, rather than one call per uid.
 *
 * The map holds only uids that name an Auth account with an email. A uid that
 * doesn't is simply absent, and what that means for a view or a send is the
 * caller's to decide. Nothing here checks whether the caller may see these
 * addresses - that is /api/resolveEmails' intent policy (`emailIntents.ts`),
 * or the role gate of whatever server code calls this.
 *
 * Kept byte-identical in admin and portal.
 */
export async function resolveAccountEmails(
  uids: string[],
): Promise<Map<string, string>> {
  const uniqueUids = [...new Set(uids)]
  const batches: string[][] = []
  for (let i = 0; i < uniqueUids.length; i += AUTH_LOOKUP_LIMIT) {
    batches.push(uniqueUids.slice(i, i + AUTH_LOOKUP_LIMIT))
  }

  const results = await Promise.all(
    batches.map((batch) => adminAuth.getUsers(batch.map((uid) => ({ uid })))),
  )

  const emails = new Map<string, string>()
  for (const { users } of results) {
    for (const user of users) {
      if (user.email) emails.set(user.uid, user.email)
    }
  }
  return emails
}

/**
 * The current address of the parent account behind each registration, keyed
 * by registration id - the address to reach a registered student's family at.
 * A registration whose parent account is gone is absent. See
 * `registrationParentUid`.
 */
export async function resolveRegistrationParentEmails(
  registrationIds: string[],
): Promise<Map<string, string>> {
  const emails = await resolveAccountEmails(
    registrationIds.map(registrationParentUid),
  )
  const byRegistration = new Map<string, string>()
  for (const id of registrationIds) {
    const email = emails.get(registrationParentUid(id))
    if (email) byRegistration.set(id, email)
  }
  return byRegistration
}
