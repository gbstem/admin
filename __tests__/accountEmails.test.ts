const mockGetUsers = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    getUsers: (...args: any[]) => mockGetUsers(...args),
  },
}))

import {
  resolveAccountEmails,
  resolveRegistrationParentEmails,
} from '$lib/server/accountEmails'

/** Answers getUsers with an account, and an address, for every uid asked. */
function everyUidHasAnAccount() {
  mockGetUsers.mockImplementation(async (ids: { uid: string }[]) => ({
    users: ids.map(({ uid }) => ({ uid, email: `${uid}@example.com` })),
  }))
}

describe('resolveAccountEmails', () => {
  beforeEach(() => {
    mockGetUsers.mockReset()
  })

  test("maps each uid to its account's current email", async () => {
    everyUidHasAnAccount()

    const emails = await resolveAccountEmails(['uid-a', 'uid-b'])

    expect(Object.fromEntries(emails)).toEqual({
      'uid-a': 'uid-a@example.com',
      'uid-b': 'uid-b@example.com',
    })
  })

  test('leaves out a uid with no account, and an account with no email', async () => {
    mockGetUsers.mockResolvedValue({ users: [{ uid: 'uid-no-email' }] })

    const emails = await resolveAccountEmails(['uid-no-email', 'uid-deleted'])

    expect(emails.size).toBe(0)
  })

  test('looks a repeated uid up once', async () => {
    everyUidHasAnAccount()

    await resolveAccountEmails(['uid-a', 'uid-a'])

    expect(mockGetUsers).toHaveBeenCalledTimes(1)
    expect(mockGetUsers).toHaveBeenCalledWith([{ uid: 'uid-a' }])
  })

  // Auth refuses more than 100 identifiers in one getUsers call.
  test('splits more than 100 uids into batches of 100', async () => {
    everyUidHasAnAccount()
    const uids = Array.from({ length: 250 }, (_, i) => `uid-${i}`)

    const emails = await resolveAccountEmails(uids)

    expect(mockGetUsers.mock.calls.map(([ids]) => ids.length)).toEqual([
      100, 100, 50,
    ])
    expect(emails.size).toBe(250)
  })

  test('makes no Auth call for no uids', async () => {
    await expect(resolveAccountEmails([])).resolves.toEqual(new Map())
    expect(mockGetUsers).not.toHaveBeenCalled()
  })
})

describe('resolveRegistrationParentEmails', () => {
  beforeEach(() => {
    mockGetUsers.mockReset()
  })

  // Siblings share a parent account, so its address is looked up once and
  // reported against each registration.
  test("keys each parent account's current address by registration", async () => {
    everyUidHasAnAccount()

    const emails = await resolveRegistrationParentEmails([
      'parent-a-1',
      'parent-a-2',
      'parent-b',
    ])

    expect(mockGetUsers).toHaveBeenCalledWith([
      { uid: 'parent-a' },
      { uid: 'parent-b' },
    ])
    expect(Object.fromEntries(emails)).toEqual({
      'parent-a-1': 'parent-a@example.com',
      'parent-a-2': 'parent-a@example.com',
      'parent-b': 'parent-b@example.com',
    })
  })

  test('leaves out a registration whose parent account is gone', async () => {
    mockGetUsers.mockResolvedValue({ users: [] })

    const emails = await resolveRegistrationParentEmails(['parent-gone-1'])

    expect(emails.size).toBe(0)
  })
})
