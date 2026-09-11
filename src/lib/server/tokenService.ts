import { adminDb } from '$lib/server/firebase'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

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
}
