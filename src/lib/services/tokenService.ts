import type { DeleteTokensRequestBody } from '../../routes/api/tokens/+server'

/** A server error's message, or the status text when the body isn't JSON. */
async function errorMessage(res: Response): Promise<string> {
  try {
    return (await res.json()).message ?? res.statusText
  } catch {
    return res.statusText
  }
}

/**
 * Service providing Data Access Layer for signup Tokens. Creating one is
 * CreateTokenForm's `/tokens?/createToken` form action.
 */
export const tokenService = {
  /**
   * Deletes a single token.
   */
  async deleteToken(tokenId: string): Promise<void> {
    await tokenService.deleteTokens([tokenId])
  },

  /**
   * Deletes tokens through `/api/tokens`: all of them, or none.
   */
  async deleteTokens(tokenIds: string[]): Promise<void> {
    const res = await fetch('/api/tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenIds } satisfies DeleteTokensRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
  },
}
