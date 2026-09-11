/** Why a signup token can't be used, or null when it can. */
export type TokenRejection = 'expired' | 'consumed'

/**
 * Whether `token` can still authorize a signup at `now`.
 *
 * Shared by the signup page's up-front check (verifyToken) and the transaction
 * that consumes the token (accountService's recordNewAccount), so the two can
 * never disagree about what "usable" means.
 */
export function tokenRejection(
  token: Pick<Data.Token<'server'>, 'expires' | 'consumable' | 'consumers'>,
  now: Date,
): TokenRejection | null {
  if (token.expires.toDate() <= now) {
    return 'expired'
  }
  if (token.consumable && (token.consumers ?? []).length >= 1) {
    return 'consumed'
  }
  return null
}
