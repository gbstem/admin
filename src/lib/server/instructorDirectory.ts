import { adminAuth } from '#lib/server/firebase.js'

const AUTH_LOOKUP_LIMIT = 100 // auth.getUsers() identifiers-per-call limit

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Resolves stored `otherInstructorUids` to the accounts' *current* email
 * addresses, for ccing co-instructors on reminder emails.
 *
 * A class doc stores uids rather than emails precisely so a co-instructor
 * changing their account's email doesn't leave the class carrying a stale
 * address, and so the client sending the reminder request can't dictate who
 * gets cc'd - only the server can turn a uid into an address. A uid whose
 * Auth account no longer exists is silently dropped: accounts get deleted,
 * and a reminder shouldn't bounce trying to reach one. Order follows the
 * uids passed in.
 */
export async function resolveCoInstructorEmails(
  uids: string[],
): Promise<string[]> {
  const uniqueUids = [...new Set(uids)]
  if (uniqueUids.length === 0) return []

  const found = new Map<string, string>()
  for (const batch of chunk(uniqueUids, AUTH_LOOKUP_LIMIT)) {
    const { users } = await adminAuth.getUsers(batch.map((uid) => ({ uid })))
    for (const user of users) {
      if (user.email) found.set(user.uid, user.email)
    }
  }

  return uniqueUids
    .map((uid) => found.get(uid))
    .filter((email): email is string => Boolean(email))
}
