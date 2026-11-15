/**
 * @jest-environment node
 */
// The routes answer with Fetch API `Response`s, which jsdom does not provide.
const mockDeleteTokens = jest.fn()
const mockRevokeTokens = jest.fn()

jest.mock('#lib/server/tokenService.js', () => ({
  tokenService: {
    deleteTokens: (...args: any[]) => mockDeleteTokens(...args),
    revokeTokens: (...args: any[]) => mockRevokeTokens(...args),
  },
}))

import { error } from '@sveltejs/kit'
import { DELETE, PATCH } from '../src/routes/api/tokens/+server'

const admin = {
  uid: 'admin-1',
  email: 'a@test.com',
  role: 'admin',
  emailVerified: true,
}
const reviewer = {
  uid: 'rev-1',
  email: 'r@test.com',
  role: 'reviewer',
  emailVerified: true,
}

const call = (user: unknown, body: unknown) =>
  (DELETE as any)({
    request: { json: async () => body },
    locals: { user },
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockDeleteTokens.mockResolvedValue(undefined)
  mockRevokeTokens.mockResolvedValue(undefined)
})

describe('DELETE /api/tokens', () => {
  it('deletes the named tokens for an admin', async () => {
    const res = await call(admin, { tokenIds: ['tok-1', 'tok-2'] })

    expect(await res.json()).toEqual({ success: true })
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

describe('DELETE /api/tokens with a used token', () => {
  it("passes on the service's 409", async () => {
    mockDeleteTokens.mockRejectedValue(
      (() => {
        try {
          error(409, 'A token someone has signed up with can be revoked.')
        } catch (e) {
          return e
        }
      })(),
    )

    await expect(call(admin, { tokenIds: ['tok-1'] })).rejects.toMatchObject({
      status: 409,
    })
  })
})

describe('PATCH /api/tokens (revoke)', () => {
  const revoke = (user: unknown, body: unknown) =>
    (PATCH as any)({
      request: { json: async () => body },
      locals: { user },
    })

  it('revokes the named tokens as the calling admin', async () => {
    const res = await revoke(admin, { tokenIds: ['tok-1', 'tok-2'] })

    expect(await res.json()).toEqual({ success: true })
    expect(mockRevokeTokens).toHaveBeenCalledWith(['tok-1', 'tok-2'], 'admin-1')
  })

  it.each([
    ['a signed-out caller', null, 401],
    ['a reviewer', reviewer, 403],
  ])('refuses %s', async (_, user, status) => {
    await expect(revoke(user, { tokenIds: ['tok-1'] })).rejects.toMatchObject({
      status,
    })
    expect(mockRevokeTokens).not.toHaveBeenCalled()
  })

  it.each([
    ['no tokens', { tokenIds: [] }],
    ['an id that addresses another path', { tokenIds: ['a/b/c'] }],
  ])('refuses %s, revoking nothing', async (_, body) => {
    await expect(revoke(admin, body)).rejects.toMatchObject({ status: 400 })
    expect(mockRevokeTokens).not.toHaveBeenCalled()
  })
})
