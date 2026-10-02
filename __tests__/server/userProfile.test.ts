const mockDocGet = jest.fn()
const mockGetUser = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: { doc: (path: string) => ({ get: () => mockDocGet(path) }) },
  adminAuth: { getUser: (uid: string) => mockGetUser(uid) },
}))

import { accountName } from '$lib/server/userProfile'

describe('accountName', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses the name on users/{uid}', async () => {
    mockDocGet.mockResolvedValue({
      data: () => ({ firstName: 'Jane', lastName: 'Doe' }),
    })

    await expect(accountName('uid-1')).resolves.toBe('Jane Doe')
    expect(mockDocGet).toHaveBeenCalledWith('users/uid-1')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('falls back to the Auth display name for an account with no users document', async () => {
    mockDocGet.mockResolvedValue({ data: () => undefined })
    mockGetUser.mockResolvedValue({ displayName: ' Demo Admin ' })

    await expect(accountName('uid-1')).resolves.toBe('Demo Admin')
  })

  it('is empty when neither has a name', async () => {
    mockDocGet.mockResolvedValue({ data: () => ({ firstName: '' }) })
    mockGetUser.mockResolvedValue({})

    await expect(accountName('uid-1')).resolves.toBe('')
  })
})
