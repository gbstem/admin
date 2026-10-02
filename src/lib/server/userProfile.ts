import { adminAuth, adminDb } from '$lib/server/firebase'

/**
 * An account's full name: `users/{uid}`'s `firstName`/`lastName`, the
 * canonical home for a name on both sites, falling back to the Auth
 * `displayName` for an account created before signup wrote that document.
 * Empty when neither has one.
 */
export async function accountName(uid: string): Promise<string> {
  const profile = (await adminDb.doc(`users/${uid}`).get()).data()
  const stored = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
  if (stored) return stored
  return (await adminAuth.getUser(uid)).displayName?.trim() ?? ''
}
