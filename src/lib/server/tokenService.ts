import type { tokenSchema } from '#lib/components/forms/schemas.js'
import { adminDb } from '#lib/server/firebase.js'
import { addHours } from 'date-fns'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { z } from 'zod'

const tokensCollection = 'tokens'

/** A signup token as the admin tokens page shows it. */
export interface AdminTokenRow {
  id: string
  values: Data.Token<'pojo'>
}

export interface FetchTokensOptions {
  limit: number
  offset: number
}

/**
 * Service providing the server-side Data Access Layer for the admin Tokens
 * page.
 */
export const tokenService = {
  /** One page of signup tokens, most recently expiring first. */
  async fetchTokens({
    limit,
    offset,
  }: FetchTokensOptions): Promise<AdminTokenRow[]> {
    const dbQuery = adminDb
      .collection(tokensCollection)
      .orderBy('expires', 'desc')
      .limit(limit)
      .offset(offset)

    const snapshot = await dbQuery.get()

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() as Data.Token<'server'>
      return {
        id: doc.id,
        values: {
          ...data,
          expires: data.expires.toDate(),
        } as Data.Token<'pojo'>,
      }
    })
  },

  /**
   * Creates a signup token, unused, that expires `expires` hours from `now`,
   * and returns its id - the secret a signup link carries.
   *
   * `values` has to have passed `tokenSchema`; the `/tokens?/createToken`
   * action validates it.
   */
  async createToken(
    { role, consumable, expires }: z.infer<typeof tokenSchema>,
    now: Date = new Date(),
  ): Promise<string> {
    const ref = await adminDb.collection(tokensCollection).add({
      role,
      consumable,
      expires: addHours(now, expires),
      consumers: [],
    } satisfies Data.Token<'pojo'>)
    return ref.id
  },

  /** Deletes signup tokens in one batch: all of them, or none. */
  async deleteTokens(tokenIds: string[]): Promise<void> {
    const batch = adminDb.batch()
    for (const tokenId of tokenIds) {
      batch.delete(adminDb.collection(tokensCollection).doc(tokenId))
    }
    await batch.commit()
  },
}
