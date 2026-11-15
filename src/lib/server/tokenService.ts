import type { tokenSchema } from '#lib/components/forms/schemas.js'
import { resolveAccountEmails } from '#lib/server/accountEmails.js'
import { adminDb } from '#lib/server/firebase.js'
import { error } from '@sveltejs/kit'
import { addHours } from 'date-fns'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { z } from 'zod'

const tokensCollection = 'tokens'

/** The tokens page's Status filter: unexpired, unrevoked tokens, or all. */
export type TokenStatusFilter = 'active' | 'all'

/** The tokens page's `?filter=`; anything unknown means active. */
export function parseTokenStatus(value: string | null): TokenStatusFilter {
  return value === 'all' ? 'all' : 'active'
}

/** A signup token as the admin tokens page shows it. */
export interface AdminTokenRow {
  id: string
  values: Data.Token<'pojo'>
  /** The creator's current address; null when unknown or the account is gone. */
  createdByEmail: string | null
  /** The revoker's current address; null when not revoked or the account is gone. */
  revokedByEmail: string | null
  /** One entry per consumer uid, null where the account no longer exists. */
  consumerEmails: Array<string | null>
}

export interface FetchTokensOptions {
  limit: number
  offset: number
  status: TokenStatusFilter
}

/**
 * Service providing the server-side Data Access Layer for the admin Tokens
 * page.
 */
export const tokenService = {
  /**
   * One page of signup tokens, newest first, with the creator's, revoker's
   * and consumers' addresses resolved in one batched Auth lookup.
   *
   * `active` leaves out expired tokens - revoked ones included, since a
   * revoke moves `expires` to the moment of revoking.
   */
  async fetchTokens(
    { limit, offset, status }: FetchTokensOptions,
    now: Date = new Date(),
  ): Promise<AdminTokenRow[]> {
    let dbQuery = adminDb
      .collection(tokensCollection)
      .orderBy('createdAt', 'desc')
    if (status === 'active') {
      // Needs the (createdAt desc, expires desc) index in firestore.indexes.json.
      // Both desc: Firestore orders by a range-filtered field implicitly, in
      // the direction of the last orderBy. The emulator never checks indexes,
      // so only production reports a mismatch.
      dbQuery = dbQuery.where('expires', '>', now)
    }
    const snapshot = await dbQuery.limit(limit).offset(offset).get()

    const tokens = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() as Data.Token<'server'>
      return {
        id: doc.id,
        values: {
          role: data.role,
          consumable: data.consumable,
          consumers: data.consumers ?? [],
          expires: data.expires.toDate(),
          createdAt: data.createdAt.toDate(),
          createdBy: data.createdBy ?? null,
          purpose: data.purpose ?? '',
          revokedAt: data.revokedAt?.toDate() ?? null,
          revokedBy: data.revokedBy ?? null,
        } satisfies Data.Token<'pojo'>,
      }
    })

    const emails = await resolveAccountEmails(
      tokens.flatMap(({ values }) =>
        [values.createdBy, values.revokedBy, ...values.consumers].filter(
          (uid): uid is string => !!uid,
        ),
      ),
    )
    return tokens.map((token) => ({
      ...token,
      createdByEmail: emails.get(token.values.createdBy ?? '') ?? null,
      revokedByEmail: emails.get(token.values.revokedBy ?? '') ?? null,
      consumerEmails: token.values.consumers.map(
        (uid) => emails.get(uid) ?? null,
      ),
    }))
  },

  /**
   * Creates a signup token, unused, that expires `expires` hours from `now`,
   * recording `creatorUid` and the purpose, and returns its id - the secret a
   * signup link carries.
   *
   * `values` has to have passed `tokenSchema`; the `/tokens?/createToken`
   * action validates it. `creatorUid` comes from the session, never the form.
   */
  async createToken(
    { role, consumable, expires, purpose }: z.infer<typeof tokenSchema>,
    creatorUid: string,
    now: Date = new Date(),
  ): Promise<string> {
    const ref = await adminDb.collection(tokensCollection).add({
      role,
      consumable,
      expires: addHours(now, expires),
      consumers: [],
      createdAt: now,
      createdBy: creatorUid,
      purpose,
      revokedAt: null,
      revokedBy: null,
    } satisfies Data.Token<'pojo'>)
    return ref.id
  },

  /**
   * Revokes signup tokens in one batch: all of them, or none. A revoked token
   * keeps its document, so its `consumers` still record who signed up with
   * it; `expires` moves to `now`, so signup and the Active filter both treat
   * it as dead with no further checks.
   */
  async revokeTokens(
    tokenIds: string[],
    revokerUid: string,
    now: Date = new Date(),
  ): Promise<void> {
    const batch = adminDb.batch()
    for (const tokenId of tokenIds) {
      // update(), not set(): a missing id fails the batch rather than
      // creating a stub token.
      batch.update(adminDb.collection(tokensCollection).doc(tokenId), {
        expires: now,
        revokedAt: now,
        revokedBy: revokerUid,
      })
    }
    await batch.commit()
  },

  /**
   * Deletes signup tokens nobody has used: all of them, or none. A token with
   * consumers is the only record of which accounts it created, so it has to
   * be revoked instead; one in the list fails the whole request with a 409.
   */
  async deleteTokens(tokenIds: string[]): Promise<void> {
    await adminDb.runTransaction(async (transaction) => {
      const refs = tokenIds.map((id) =>
        adminDb.collection(tokensCollection).doc(id),
      )
      const snaps = await transaction.getAll(...refs)
      for (const snap of snaps) {
        const consumers = (snap.data()?.consumers ?? []) as string[]
        if (consumers.length > 0) {
          throw error(
            409,
            'A token someone has signed up with can be revoked, not deleted.',
          )
        }
      }
      for (const ref of refs) {
        transaction.delete(ref)
      }
    })
  },
}
