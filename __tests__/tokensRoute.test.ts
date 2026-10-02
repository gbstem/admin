const mockDeleteTokens = jest.fn()

jest.mock('$lib/server/tokenService', () => ({
  tokenService: {
    deleteTokens: (...args: any[]) => mockDeleteTokens(...args),
  },
}))

import { DELETE } from '../src/routes/api/tokens/+server'

const admin = { uid: 'admin-1', email: 'a@test.com', role: 'admin' }
const reviewer = { uid: 'rev-1', email: 'r@test.com', role: 'reviewer' }

const call = (user: unknown, body: unknown) =>
  (DELETE as any)({
    request: { json: async () => body },
    locals: { user },
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockDeleteTokens.mockResolvedValue(undefined)
})

describe('DELETE /api/tokens', () => {
  it('deletes the named tokens for an admin', async () => {
    const res = await call(admin, { tokenIds: ['tok-1', 'tok-2'] })

    expect(res.body).toEqual({ success: true })
    expect(mockDeleteTokens).toHaveBeenCalledWith(['tok-1', 'tok-2'])
  })

  it.each([
    ['a signed-out caller', null, 401],
    ['a reviewer', reviewer, 403],
  ])('refuses %s', async (_, user, status) => {
    await expect(call(user, { tokenIds: ['tok-1'] })).rejects.toMatchObject({
      status,
    })
    expect(mockDeleteTokens).not.toHaveBeenCalled()
  })

  it.each([
    ['no tokens', { tokenIds: [] }],
    ['a missing list', {}],
    ['an id that addresses another path', { tokenIds: ['tok-1', 'a/b/c'] }],
    [
      'more tokens than one batch holds',
      { tokenIds: Array.from({ length: 501 }, (_, i) => `tok-${i}`) },
    ],
  ])('refuses %s, deleting nothing', async (_, body) => {
    await expect(call(admin, body)).rejects.toMatchObject({ status: 400 })
    expect(mockDeleteTokens).not.toHaveBeenCalled()
  })
})
