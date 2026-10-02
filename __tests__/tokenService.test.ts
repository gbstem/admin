import { tokenService } from '$lib/services/tokenService'

describe('tokenService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  const deleted = () => {
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    return { url, method: init.method, body: JSON.parse(init.body) }
  }

  describe('deleteToken', () => {
    it('deletes the given token through /api/tokens', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await tokenService.deleteToken('tok-1')

      expect(deleted()).toEqual({
        url: '/api/tokens',
        method: 'DELETE',
        body: { tokenIds: ['tok-1'] },
      })
    })

    it("throws the server's message when the delete is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Admins only.' }),
      })

      await expect(tokenService.deleteToken('tok-1')).rejects.toThrow(
        'Admins only.',
      )
    })
  })

  describe('deleteTokens', () => {
    it('deletes all given tokens in one request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await tokenService.deleteTokens(['tok-1', 'tok-2', 'tok-3'])

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(deleted().body).toEqual({ tokenIds: ['tok-1', 'tok-2', 'tok-3'] })
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
