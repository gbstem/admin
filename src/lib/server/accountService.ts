import { tokenRejection } from '$lib/helpers/signupTokens'
import { adminDb } from '$lib/server/firebase'

export interface NewAccount {
  uid: string
  token: string
  firstName: string
  lastName: string
}

/**
 * Records a newly created Auth account against the signup token that
 * authorized it: writes its `users` document and adds it to the token's
 * `consumers`, in one transaction that re-reads the token first.
 *
 * The signup action checks the token before it creates the Auth account, but
 * two signups racing on the same single-use token both pass that check - the
 * old code said as much and let both through. Re-reading the token inside the
 * transaction that consumes it is what makes single-use hold: the second
 * transaction sees the first consumer and throws `'consumed'`, and writes
 * nothing. It also keeps the profile and the consumption together, so a token
 * is never used up by an account with no `users` document, or the reverse.
 *
 * Throws `'fake'`, `'expired'` or `'consumed'` - the same values as
 * verifyToken - for a token that can no longer be used.
 */
export async function recordNewAccount(account: NewAccount): Promise<void> {
  const tokenRef = adminDb.collection('tokens').doc(account.token)
  const userRef = adminDb.collection('users').doc(account.uid)

  await adminDb.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef)
    if (!tokenSnap.exists) {
      throw 'fake'
    }
    const token = tokenSnap.data() as Data.Token<'server'>
    const rejection = tokenRejection(token, new Date())
    if (rejection) {
      throw rejection
    }

    transaction.set(userRef, {
      firstName: account.firstName,
      lastName: account.lastName,
    })
    transaction.update(tokenRef, {
      consumers: [...(token.consumers ?? []), account.uid],
    })
  })
}
