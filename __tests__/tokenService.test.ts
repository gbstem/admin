import { tokenService } from '#lib/services/tokenService.js'

describe('tokenService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  const sent = () => {
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    return { url, method: init.method, body: JSON.parse(init.body) }
  }

  describe('revokeTokens', () => {
    it('revokes all given tokens in one PATCH to /api/tokens', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await tokenService.revokeTokens(['tok-1', 'tok-2'])

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(sent()).toEqual({
        url: '/api/tokens',
        method: 'PATCH',
        body: { tokenIds: ['tok-1', 'tok-2'] },
      })
    })

    it("throws the server's message when the revoke is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Admins only.' }),
      })

      await expect(tokenService.revokeTokens(['tok-1'])).rejects.toThrow(
        'Admins only.',
      )
    })
  })

  describe('deleteTokens', () => {
    it('deletes all given tokens in one DELETE to /api/tokens', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await tokenService.deleteTokens(['tok-1', 'tok-2', 'tok-3'])

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(sent()).toEqual({
        url: '/api/tokens',
        method: 'DELETE',
        body: { tokenIds: ['tok-1', 'tok-2', 'tok-3'] },
      })
    })

    it("throws the server's message when a used token blocks the delete", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Conflict',
        json: async () => ({
          message:
            'A token someone has signed up with can be revoked, not deleted.',
        }),
      })

      await expect(tokenService.deleteTokens(['tok-1'])).rejects.toThrow(
        'can be revoked, not deleted',
      )
    })

    it('falls back to the status text when the error body is not JSON', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(tokenService.deleteTokens(['tok-1'])).rejects.toThrow(
        'Bad Gateway',
      )
    })
  })
})
