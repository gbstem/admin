const mockGetUsers = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminAuth: {
    getUsers: (...args: any[]) => mockGetUsers(...args),
  },
}))

import { resolveCoInstructorEmails } from '#lib/server/instructorDirectory.js'

describe('resolveCoInstructorEmails', () => {
  beforeEach(() => {
    mockGetUsers.mockReset()
  })

  test('returns [] without calling Auth for an empty list', async () => {
    const result = await resolveCoInstructorEmails([])
    expect(result).toEqual([])
    expect(mockGetUsers).not.toHaveBeenCalled()
  })

  test('resolves uids to their accounts current emails', async () => {
    mockGetUsers.mockResolvedValue({
      users: [
        { uid: 'uid-1', email: 'one@example.com' },
        { uid: 'uid-2', email: 'two@example.com' },
      ],
    })

    const result = await resolveCoInstructorEmails(['uid-1', 'uid-2'])
    expect(result).toEqual(['one@example.com', 'two@example.com'])
  })

  // Accounts get deleted; a reminder shouldn't bounce trying to reach one.
  test('drops a uid with no Auth account', async () => {
    mockGetUsers.mockResolvedValue({
      users: [{ uid: 'uid-1', email: 'one@example.com' }],
    })

    const result = await resolveCoInstructorEmails(['uid-1', 'uid-deleted'])
    expect(result).toEqual(['one@example.com'])
  })

  test('dedupes repeated uids before looking them up', async () => {
    mockGetUsers.mockResolvedValue({
      users: [{ uid: 'uid-1', email: 'one@example.com' }],
    })

    const result = await resolveCoInstructorEmails(['uid-1', 'uid-1'])
    expect(result).toEqual(['one@example.com'])
    expect(mockGetUsers).toHaveBeenCalledTimes(1)
    expect(mockGetUsers).toHaveBeenCalledWith([{ uid: 'uid-1' }])
  })

  // auth.getUsers()'s identifiers-per-call limit is 100.
  test('chunks more than 100 uids into multiple getUsers calls', async () => {
    const uids = Array.from({ length: 150 }, (_, i) => `uid-${i}`)
    mockGetUsers.mockImplementation((identifiers: { uid: string }[]) =>
      Promise.resolve({
        users: identifiers.map(({ uid }) => ({
          uid,
          email: `${uid}@example.com`,
        })),
      }),
    )

    const result = await resolveCoInstructorEmails(uids)
    expect(mockGetUsers).toHaveBeenCalledTimes(2)
    expect(mockGetUsers.mock.calls[0][0]).toHaveLength(100)
    expect(mockGetUsers.mock.calls[1][0]).toHaveLength(50)
    expect(result).toHaveLength(150)
    expect(result[0]).toBe('uid-0@example.com')
    expect(result[149]).toBe('uid-149@example.com')
  })
})
