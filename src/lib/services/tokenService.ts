import { errorMessage } from '#lib/shared/apiErrors.js'
import type { TokenIdsRequestBody } from '../../routes/api/tokens/+server'

async function send(method: 'PATCH' | 'DELETE', tokenIds: string[]) {
  const res = await fetch('/api/tokens', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenIds } satisfies TokenIdsRequestBody),
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res))
  }
}

/**
 * Service providing Data Access Layer for signup Tokens. Creating one is
 * CreateTokenForm's `/tokens?/createToken` form action.
 */
export const tokenService = {
  /**
   * Revokes tokens through `/api/tokens`: all of them, or none. The documents
   * stay, so their consumers stay on record.
   */
  async revokeTokens(tokenIds: string[]): Promise<void> {
    await send('PATCH', tokenIds)
  },

  /**
   * Deletes unused tokens through `/api/tokens`: all of them, or none. The
   * server refuses the lot if any has been used.
   */
  async deleteTokens(tokenIds: string[]): Promise<void> {
    await send('DELETE', tokenIds)
  },
}
