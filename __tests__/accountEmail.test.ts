const mockGetUser = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    getUser: (...args: any[]) => mockGetUser(...args),
  },
}))

import { resolveAccountEmail } from '$lib/server/accountEmail'

describe('resolveAccountEmail', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // The scenario this function exists for: the person changed their account's
  // email after an address was stored, and Auth, looked up by the stable uid,
  // has the current one.
  test('returns the live Firebase Auth email', async () => {
    mockGetUser.mockResolvedValue({ email: 'new@example.com' })

    await expect(
      resolveAccountEmail('uid-owner', 'Interviewer', '/api/test'),
    ).resolves.toBe('new@example.com')
    expect(mockGetUser).toHaveBeenCalledWith('uid-owner')
  })

  test('fails with a 400 if the uid names no Auth account', async () => {
    mockGetUser.mockRejectedValue(new Error('user-not-found'))

    await expect(
      resolveAccountEmail('uid-deleted', 'Applicant', '/api/test'),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('fails with a 400 if the Auth record has no email', async () => {
    mockGetUser.mockResolvedValue({ email: undefined })

    await expect(
      resolveAccountEmail('uid-owner', 'Instructor', '/api/test'),
    ).rejects.toMatchObject({ status: 400 })
  })
})
